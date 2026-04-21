// Get React hooks from window - with safety checks and retry mechanism
let useState, useEffect, useRef, memo, ReactElement;
const getReactHooks = () => {
    if (typeof window !== 'undefined' && window.React) {
        const React = window.React;
        return {
            useState: React.useState,
            useEffect: React.useEffect,
            useRef: React.useRef,
            memo: React.memo,
            createElement: React.createElement
        };
    }
    return null;
};

let hooks = getReactHooks();
if (hooks) {
    ({ useState, useEffect, useRef, memo } = hooks);
    ReactElement = hooks.createElement;
} else {
    // If React is not available, wait for it and retry
    console.warn('⚠️ ProjectProgressTracker: React not available immediately, will retry...');
    let retries = 0;
    const maxRetries = 50; // 5 seconds max
    
    const checkReact = setInterval(() => {
        retries++;
        hooks = getReactHooks();
        if (hooks) {
            ({ useState, useEffect, useRef, memo } = hooks);
            ReactElement = hooks.createElement;
            clearInterval(checkReact);
            console.log('✅ ProjectProgressTracker: React hooks loaded successfully');
        } else if (retries >= maxRetries) {
            clearInterval(checkReact);
            console.error('❌ ProjectProgressTracker: React is not available after retries');
            // Create fallback functions to prevent errors
            useState = function(initial) { return [initial, function() {}]; };
            useEffect = function() {};
            useRef = function(initial) { return { current: initial }; };
            memo = function(component) { return component; };
            ReactElement = function() { return null; };
        }
    }, 100);
}

// Ensure React.createElement is available
if (!ReactElement && typeof window !== 'undefined' && window.React && window.React.createElement) {
    ReactElement = window.React.createElement;
}

const storage = window.storage;

/** Show in Progress Tracker only when explicitly opted in (DB default is false). */
function isIncludedInProgressTracker(value) {
    if (value === true || value === 1) return true;
    if (typeof value === 'string') {
        const s = value.trim().toLowerCase();
        return s === 'true' || s === '1';
    }
    return false;
}

// Main component - completely rebuilt for reliability
const ProjectProgressTracker = function ProjectProgressTrackerComponent(props) {
    const {
        onBack: onBackProp,
        focusProjectId: focusProjectIdProp = null,
        focusMonthIndex: focusMonthIndexProp = null,
        focusField: focusFieldProp = null,
        focusYear: focusYearProp = null,
        focusMonthName: focusMonthNameProp = null,
        focusInput: focusInputProp = null,
        onFocusHandled: onFocusHandledProp = null
    } = props || {};

    // Reduced logging - only log on initial mount to reduce noise
    const hasLoggedRef = useRef(false);
    useEffect(() => {
        if (!hasLoggedRef.current) {
            hasLoggedRef.current = true;
        }
    }, []);
    
    // Check if this is being called
    if (!props) {
        console.warn('⚠️ ProjectProgressTracker: No props received, using defaults');
    }
    
    // Validate props
    const onBack = typeof onBackProp === 'function' ? onBackProp : () => console.warn('onBack not available');
    
    // Safe constants
    const now = new Date();
    const currentYear = Number(now.getFullYear()) || 2025;
    const currentMonth = Number(now.getMonth()) || 0;
    
    // Working months calculation
    const getWorkingMonths = () => {
        const previousOne = new Date(currentYear, currentMonth, 1);
        previousOne.setMonth(previousOne.getMonth() - 1);
        const previousTwo = new Date(currentYear, currentMonth, 1);
        previousTwo.setMonth(previousTwo.getMonth() - 2);
        return [
            { monthIndex: Number(previousOne.getMonth()), year: Number(previousOne.getFullYear()) },
            { monthIndex: Number(previousTwo.getMonth()), year: Number(previousTwo.getFullYear()) }
        ];
    };
    
    const workingMonths = getWorkingMonths();
    const isWorkingMonthForYear = (monthIndex, year) => {
        if (typeof monthIndex !== 'number' || typeof year !== 'number') return false;
        return workingMonths.some((entry) => entry.monthIndex === monthIndex && entry.year === year);
    };
    // Show whole year for comprehensive tracking
    const months = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December'
    ];
    /** Earliest calendar month (leftmost on the grid) among working months for a given year */
    const getFirstWorkingMonthNameForYear = (year) => {
        const y = Number(year);
        if (Number.isNaN(y)) return null;
        const entries = workingMonths.filter((e) => Number(e?.year) === y);
        if (!entries.length) return null;
        const sorted = [...entries].sort((a, b) => a.monthIndex - b.monthIndex);
        const idx = sorted[0].monthIndex;
        if (typeof idx !== 'number' || idx < 0 || idx >= months.length) return null;
        return months[idx] || null;
    };
    // Wide cells + sticky column width (used for horizontal scroll alignment)
    const TRACK_CELL_WIDTH = 200;
    const TRACK_MONTH_GROUP_WIDTH = TRACK_CELL_WIDTH * 4;
    /** Between month groups (after Comments, before next Compliance / after last month before PM) */
    const TRACK_MONTH_SEPARATOR_BORDER = '3px solid #64748b';
    const TRACK_STICKY_PROJECT_WIDTH = 340;
    
    // State - always initialize with empty array to prevent undefined/null issues
    const [projects, setProjects] = useState(() => []);
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [loadError, setLoadError] = useState(null);
    const [saving, setSaving] = useState(false);
    
    // Inline editing state (comments: textarea in cell; compliance/data reserved for future inline links)
    const [editingCell, setEditingCell] = useState(null); // {projectId, month, field}
    const [editingValue, setEditingValue] = useState('');
    
    // Refs
    const tableRef = useRef(null);
    const [focusedCellKey, setFocusedCellKey] = useState(null);
    const [focusedRowId, setFocusedRowId] = useState(null);
    const usersCacheRef = useRef([]);
    const usersLoadPromiseRef = useRef(null);
    const focusRequestRef = useRef(null);
    const pendingFocusRef = useRef(false);
    /** Debounced comment autosave (aligned with Monthly Data checklist notes pattern) */
    const commentAutosaveTimerRef = useRef(null);
    const projectsRef = useRef([]);
    const editingCellRef = useRef(null);
    const editingValueRef = useRef('');
    const saveProgressDataRef = useRef(null);
    const flushPendingCommentSaveRef = useRef(async () => {});
    const selectedYearRef = useRef(selectedYear);

    useEffect(() => {
        projectsRef.current = projects;
    }, [projects]);
    useEffect(() => {
        editingCellRef.current = editingCell;
    }, [editingCell]);
    useEffect(() => {
        editingValueRef.current = editingValue;
    }, [editingValue]);
    useEffect(() => {
        selectedYearRef.current = selectedYear;
    }, [selectedYear]);

    // Scroll horizontally so the first working month column (chronologically) is in view after load / year change
    useEffect(() => {
        try {
            if (!tableRef?.current) return;
            const targetMonth = getFirstWorkingMonthNameForYear(selectedYear);
            if (!targetMonth) return;

            const runScroll = () => {
                try {
                    const container = tableRef.current;
                    if (!container) return;
                    const headerCell = container.querySelector(`[data-month-header="${targetMonth}"]`);
                    if (headerCell && typeof headerCell.offsetLeft === 'number') {
                        const desiredScroll = Math.max(headerCell.offsetLeft - TRACK_STICKY_PROJECT_WIDTH, 0);
                        container.scrollTo({
                            left: desiredScroll,
                            behavior: 'smooth'
                        });
                    }
                } catch (scrollErr) {
                    console.warn('⚠️ ProjectProgressTracker: Failed to auto-scroll to first working month:', scrollErr);
                }
            };
            window.requestAnimationFrame(() => {
                window.requestAnimationFrame(runScroll);
            });
        } catch (err) {
            console.warn('⚠️ ProjectProgressTracker: Auto-scroll effect error:', err);
        }
    }, [projects, selectedYear]);

    // Load projects
    useEffect(() => {
        const load = async (retryCount = 0) => {
            try {
                
                // Wait for DatabaseAPI to be available
                if (!window.DatabaseAPI || !window.DatabaseAPI.getProjects) {
                    if (retryCount < 10) {
                        console.warn('⚠️ ProjectProgressTracker: DatabaseAPI not available yet, retrying in 200ms...');
                        setTimeout(() => load(retryCount + 1), 200);
                        return;
                    } else {
                        console.error('❌ ProjectProgressTracker: DatabaseAPI.getProjects not available after retries');
                        setLoadError('Database API not available');
                        return;
                    }
                }
                
                if (window.DatabaseAPI && window.DatabaseAPI.getProjects) {
                    const response = await window.DatabaseAPI.getProjects({ forceRefresh: true });
                    
                    let projs = [];
                    
                    // Try all possible response formats (matching Projects.jsx logic)
                    if (response?.data?.projects && Array.isArray(response.data.projects)) {
                        projs = response.data.projects;
                    } else if (response?.data?.data?.projects && Array.isArray(response.data.data.projects)) {
                        projs = response.data.data.projects;
                    } else if (response?.projects && Array.isArray(response.projects)) {
                        projs = response.projects;
                    } else if (Array.isArray(response?.data)) {
                        projs = response.data;
                    } else if (Array.isArray(response)) {
                        projs = response;
                    } else {
                        console.warn('⚠️ ProjectProgressTracker: No projects found in standard locations');
                        projs = [];
                    }
                    
                    // Normalize projects: map clientName to client for frontend compatibility
                    // Also parse monthlyProgress if it's a JSON string
                    const normalizedProjects = (Array.isArray(projs) ? projs : []).map(p => {
                        let monthlyProgress = p.monthlyProgress;
                        
                        // Parse monthlyProgress if it's a JSON string
                        if (typeof monthlyProgress === 'string' && monthlyProgress.trim()) {
                            try {
                                monthlyProgress = JSON.parse(monthlyProgress);
                            } catch (e) {
                                console.warn('⚠️ ProjectProgressTracker: Failed to parse monthlyProgress JSON:', e);
                                monthlyProgress = {};
                            }
                        }
                        
                        return {
                        ...p,
                            client: p.clientName || p.client || '',
                            monthlyProgress: monthlyProgress && typeof monthlyProgress === 'object' && !Array.isArray(monthlyProgress) ? monthlyProgress : {}
                        };
                    });
                    
                    // Only projects with Include in Progress Tracker checked (explicit true)
                    const monthlyProjects = normalizedProjects.filter((p) => {
                        if (!p || typeof p !== 'object') return false;
                        return isIncludedInProgressTracker(p.includeInProgressTracker);
                    });
                    
                    
                    // Log monthlyProgress data for each project to verify data is loaded
                    monthlyProjects.forEach((p, idx) => {
                        const progressKeys = p.monthlyProgress ? Object.keys(p.monthlyProgress) : [];
                    });
                    
                    if (monthlyProjects.length > 0) {
                    } else if (normalizedProjects.length > 0) {
                        console.warn('⚠️ ProjectProgressTracker: No projects with Include in Progress Tracker enabled');
                    } else {
                    }
                    
                    // Always set an array (never null/undefined)
                    setProjects(Array.isArray(monthlyProjects) ? monthlyProjects : []);
                } else {
                    console.error('❌ ProjectProgressTracker: DatabaseAPI.getProjects not available');
                    setLoadError('Database API not available');
                }
            } catch (err) {
                console.error('❌ ProjectProgressTracker: Load error:', err);
                console.error('❌ Error details:', {
                    message: err?.message,
                    stack: err?.stack,
                    name: err?.name
                });
                setLoadError(String(err?.message || 'Failed to load projects'));
                // Always ensure projects is an array, never null/undefined
                setProjects([]);
            }
        };
        load();
    }, []);

    // Hydrate missing review sections from project detail endpoint.
    // The list API is intentionally slim and may omit these heavy JSON fields.
    useEffect(() => {
        if (!Array.isArray(projects) || projects.length === 0) return;
        if (!window.DatabaseAPI || typeof window.DatabaseAPI.getProject !== 'function') return;

        const needsHydration = projects.filter((project) => {
            if (!project || !project.id) return false;
            const monthlyRaw = project.monthlyDataReviewSections;
            const complianceRaw = project.complianceReviewSections;
            const documentRaw = project.documentSections;
            const monthlyTrimmed = typeof monthlyRaw === 'string' ? monthlyRaw.trim() : monthlyRaw;
            const complianceTrimmed = typeof complianceRaw === 'string' ? complianceRaw.trim() : complianceRaw;
            const documentTrimmed = typeof documentRaw === 'string' ? documentRaw.trim() : documentRaw;

            // Hydrate whenever these fields are absent/empty on list payload.
            // Some projects contain review data even if process flags are false/missing.
            const needsMonthlyData =
                monthlyTrimmed == null ||
                monthlyTrimmed === '' ||
                monthlyTrimmed === '{}' ||
                monthlyTrimmed === 'null';
            const needsCompliance =
                complianceTrimmed == null ||
                complianceTrimmed === '' ||
                complianceTrimmed === '{}' ||
                complianceTrimmed === 'null';
            const needsDocumentCollection =
                documentTrimmed == null ||
                documentTrimmed === '' ||
                documentTrimmed === '{}' ||
                documentTrimmed === 'null';
            return needsMonthlyData || needsCompliance || needsDocumentCollection;
        });

        if (needsHydration.length === 0) return;

        let cancelled = false;

        const hydrate = async () => {
            try {
                const detailResponses = await Promise.allSettled(
                    needsHydration.map((project) =>
                        window.DatabaseAPI.getProject(project.id, { forceRefresh: true })
                    )
                );

                if (cancelled) return;

                const detailMap = new Map();
                detailResponses.forEach((result) => {
                    if (result.status !== 'fulfilled') return;
                    const detailProject =
                        result.value?.data?.project ||
                        result.value?.project ||
                        null;
                    if (!detailProject || !detailProject.id) return;
                    detailMap.set(String(detailProject.id), detailProject);
                });

                if (detailMap.size === 0) return;

                setProjects((prevProjects) => {
                    if (!Array.isArray(prevProjects) || prevProjects.length === 0) return prevProjects;

                    let changed = false;
                    const nextProjects = prevProjects.map((project) => {
                        const detail = detailMap.get(String(project?.id));
                        if (!detail) return project;

                        const monthlyDataReviewSections =
                            detail.monthlyDataReviewSections != null
                                ? detail.monthlyDataReviewSections
                                : project.monthlyDataReviewSections;
                        const complianceReviewSections =
                            detail.complianceReviewSections != null
                                ? detail.complianceReviewSections
                                : project.complianceReviewSections;
                        const documentSections =
                            detail.documentSections != null
                                ? detail.documentSections
                                : project.documentSections;

                        const monthlyChanged = monthlyDataReviewSections !== project.monthlyDataReviewSections;
                        const complianceChanged = complianceReviewSections !== project.complianceReviewSections;
                        const documentChanged = documentSections !== project.documentSections;
                        if (!monthlyChanged && !complianceChanged && !documentChanged) return project;

                        changed = true;
                        return {
                            ...project,
                            monthlyDataReviewSections,
                            complianceReviewSections,
                            documentSections
                        };
                    });

                    return changed ? nextProjects : prevProjects;
                });
            } catch (error) {
                console.warn('⚠️ ProjectProgressTracker: Failed to hydrate review sections from detail endpoint:', error);
            }
        };

        hydrate();
        return () => {
            cancelled = true;
        };
    }, [projects]);

    /**
     * Lightweight self-test for monthlyProgress persistence.
     *
     * Triggered only when:
     *  - URL search or hash contains "progressSelfTest=1"
     *  - And there is at least one project loaded
     *
     * This avoids affecting normal users and production traffic.
     */
    useEffect(() => {
        try {
            if (!projects || projects.length === 0) return;

            const href = window.location?.href || '';
            let selfTestEnabled = false;

            try {
                const url = new URL(href);
                const searchParams = url.searchParams;
                const hash = window.location.hash || '';
                const [, hashQuery = ''] = (hash.startsWith('#') ? hash.substring(1) : hash).split('?');
                const hashParams = new URLSearchParams(hashQuery);

                selfTestEnabled =
                    searchParams.get('progressSelfTest') === '1' ||
                    hashParams.get('progressSelfTest') === '1';
            } catch (urlErr) {
                console.warn('⚠️ ProjectProgressTracker: Self-test URL parsing error:', urlErr);
            }

            if (!selfTestEnabled) return;

            // Run only once per page load
            if (window.__PROJECT_PROGRESS_SELFTEST_RAN__) {
                return;
            }
            window.__PROJECT_PROGRESS_SELFTEST_RAN__ = true;

            (async () => {
                try {

                    const project = projects[0];
                    if (!project || !project.id) {
                        console.warn('⚠️ ProjectProgressTracker: Self-test aborted, no valid project found');
                        return;
                    }

                    // Normalize existing monthlyProgress
                    let monthlyProgress = project.monthlyProgress || {};
                    if (typeof monthlyProgress === 'string' && monthlyProgress.trim()) {
                        try {
                            monthlyProgress = JSON.parse(monthlyProgress);
                        } catch (e) {
                            console.warn(
                                '⚠️ ProjectProgressTracker: Self-test failed to parse existing monthlyProgress, starting fresh',
                                e
                            );
                            monthlyProgress = {};
                        }
                    }

                    const monthKey = `${months[currentMonth]}-${selectedYear}`;
                    const testComment = `Self-test at ${new Date().toISOString()}`;

                    const updated = {
                        ...monthlyProgress,
                        [monthKey]: {
                            ...(monthlyProgress[monthKey] || {}),
                            comments: testComment
                        }
                    };


                    if (!window.DatabaseAPI || !window.DatabaseAPI.updateProject || !window.DatabaseAPI.getProject) {
                        console.error(
                            '❌ ProjectProgressTracker: Self-test aborted, DatabaseAPI update/getProject not available'
                        );
                        return;
                    }

                    await window.DatabaseAPI.updateProject(project.id, {
                        monthlyProgress: JSON.stringify(updated)
                    });

                    await new Promise((resolve) => setTimeout(resolve, 800));

                    const verifyResp = await window.DatabaseAPI.getProject(project.id);
                    const savedProject =
                        verifyResp?.data?.project || verifyResp?.project || verifyResp?.data || verifyResp;

                    let savedProgress = savedProject?.monthlyProgress || {};
                    if (typeof savedProgress === 'string' && savedProgress.trim()) {
                        try {
                            savedProgress = JSON.parse(savedProgress);
                        } catch (e) {
                            console.error(
                                '❌ ProjectProgressTracker: Self-test failed to parse saved monthlyProgress',
                                e
                            );
                            savedProgress = {};
                        }
                    }

                    const savedComment = savedProgress?.[monthKey]?.comments;


                    if (savedComment === testComment) {
                    } else {
                        console.error(
                            '❌❌❌ ProjectProgressTracker: MONTHLY PROGRESS PERSISTENCE SELF-TEST FAILED - value mismatch'
                        );
                    }
                } catch (err) {
                    console.error('❌ ProjectProgressTracker: Error during persistence self-test:', err);
                }
            })();
        } catch (outerErr) {
            console.error('❌ ProjectProgressTracker: Self-test setup error:', outerErr);
        }
    }, [projects, months, currentMonth, selectedYear]);
    
    useEffect(() => {
        fetchUsersSafe().catch(error => {
            console.warn('⚠️ ProjectProgressTracker: Initial user preload failed:', error);
        });
    }, []);

    useEffect(() => {
        if (!focusProjectIdProp) {
            return;
        }

        const normalizedProjectId = String(focusProjectIdProp);
        let normalizedMonthIndex = null;
        if (typeof focusMonthIndexProp === 'number' && !Number.isNaN(focusMonthIndexProp)) {
            normalizedMonthIndex = focusMonthIndexProp;
        } else if (
            focusMonthIndexProp !== null &&
            focusMonthIndexProp !== undefined &&
            !Number.isNaN(Number(focusMonthIndexProp))
        ) {
            normalizedMonthIndex = Number(focusMonthIndexProp);
        }

        const normalizedYear =
            focusYearProp !== null &&
            focusYearProp !== undefined &&
            !Number.isNaN(Number(focusYearProp))
                ? Number(focusYearProp)
                : null;

        const normalizeFocusInput = (value) => {
            if (value === null || value === undefined) return null;
            const normalized = String(value).trim().toLowerCase();
            if (!normalized || ['false', '0', 'no'].includes(normalized)) return null;
            if (['comments', 'comment', 'commentinput', 'comment-input'].includes(normalized)) return 'comments';
            if (['data', 'datalink', 'data-link'].includes(normalized)) return 'data';
            if (['compliance', 'compliancelink', 'compliance-link'].includes(normalized)) return 'compliance';
            if (['doccollection', 'documentcollection', 'doc-collection', 'monthly-document-collection'].includes(normalized)) {
                return 'docCollection';
            }
            return 'comments';
        };
        const normalizedFocusInput = normalizeFocusInput(focusInputProp);
        const resolvedFieldFromFocusInput = normalizedFocusInput || null;

        focusRequestRef.current = {
            projectId: normalizedProjectId,
            monthIndex: normalizedMonthIndex,
            monthName: focusMonthNameProp || null,
            field: resolvedFieldFromFocusInput || focusFieldProp || 'comments',
            year: normalizedYear,
            openInput: !!normalizedFocusInput
        };
        pendingFocusRef.current = true;
    }, [focusProjectIdProp, focusMonthIndexProp, focusFieldProp, focusYearProp, focusMonthNameProp, focusInputProp]);

    useEffect(() => {
        if (!pendingFocusRef.current) {
            return;
        }

        const focusRequest = focusRequestRef.current;
        if (!focusRequest || !focusRequest.projectId) {
            return;
        }

        if (!Array.isArray(projects) || projects.length === 0) {
            return;
        }

        const targetYear = focusRequest.year;
        if (
            targetYear !== null &&
            targetYear !== undefined &&
            !Number.isNaN(targetYear) &&
            targetYear !== selectedYear
        ) {
            setSelectedYear(targetYear);
            return;
        }

        const resolvedMonthIndex =
            typeof focusRequest.monthIndex === 'number' &&
            !Number.isNaN(focusRequest.monthIndex) &&
            focusRequest.monthIndex >= 0
                ? focusRequest.monthIndex
                : months.indexOf(String(focusRequest.monthName || ''));
        const resolvedMonthName =
            resolvedMonthIndex >= 0 && resolvedMonthIndex < months.length
                ? months[resolvedMonthIndex]
                : focusRequest.monthName || months[Math.max(currentMonth, 0)];
        const resolvedField = focusRequest.field || 'comments';
        const cellKey = `${focusRequest.projectId}-${resolvedMonthName}-${resolvedField}`;

        const attemptFocus = (attempt = 0) => {
            const container = tableRef.current;
            if (!container) {
                if (attempt < 6) {
                    setTimeout(() => attemptFocus(attempt + 1), 200);
                }
                return;
            }

            const selector = `[data-cell-key="${escapeAttributeValue(cellKey)}"]`;
            const targetCell = container.querySelector(selector);

            if (targetCell) {
                setFocusedCellKey(cellKey);
                setFocusedRowId(focusRequest.projectId);
                try {
                    targetCell.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                        inline: 'center'
                    });
                } catch (error) {
                    console.warn('⚠️ ProjectProgressTracker: scrollIntoView failed for focus cell:', error);
                }
                if (focusRequest.openInput && typeof targetCell.click === 'function') {
                    setTimeout(() => {
                        try {
                            targetCell.click();
                        } catch (error) {
                            console.warn('⚠️ ProjectProgressTracker: Failed to open focused input:', error);
                        }
                    }, 150);
                }
                pendingFocusRef.current = false;
                focusRequestRef.current = null;
                if (typeof onFocusHandledProp === 'function') {
                    try {
                        onFocusHandledProp();
                    } catch (error) {
                        console.error('❌ ProjectProgressTracker: Error running onFocusHandled callback:', error);
                    }
                }
            } else if (attempt < 6) {
                setTimeout(() => attemptFocus(attempt + 1), 200);
            } else {
                pendingFocusRef.current = false;
                focusRequestRef.current = null;
                if (typeof onFocusHandledProp === 'function') {
                    try {
                        onFocusHandledProp();
                    } catch (error) {
                        console.error('❌ ProjectProgressTracker: Error running onFocusHandled callback after retries:', error);
                    }
                }
            }
        };

        attemptFocus();
    }, [projects, selectedYear, onFocusHandledProp]);
    
    // Validate projects before render
    // Normalize and validate projects - handle both numeric and string IDs, client/clientName
    // Wrap in try-catch to ensure it never crashes, always returns an array
    let safeProjects = [];
    try {
        if (Array.isArray(projects) && projects.length > 0) {
            safeProjects = projects.filter(p => {
                try {
                    // More flexible validation: ID can be string or number, name must exist
                    if (!p || typeof p !== 'object') return false;
                    if (p.id === undefined || p.id === null) return false;
                    if (typeof p.name !== 'string' || p.name.trim() === '') return false;
                    return true;
                } catch (e) {
                    console.warn('⚠️ ProjectProgressTracker: Error validating project:', p, e);
                    return false;
                }
            }).map(p => {
                try {
                    // Normalize client/clientName (like Projects.jsx does)
                    const client = p.clientName || p.client || '';
                    
                    // Parse monthlyProgress if it's still a JSON string
                    let monthlyProgress = p.monthlyProgress;
                    if (typeof monthlyProgress === 'string' && monthlyProgress.trim()) {
                        try {
                            monthlyProgress = JSON.parse(monthlyProgress);
                        } catch (e) {
                            console.warn('⚠️ ProjectProgressTracker: Failed to parse monthlyProgress in mapping:', e);
                            monthlyProgress = {};
                        }
                    }
                    
                    return {
                        id: String(p.id || ''),
                        name: String(p.name || ''),
                        client: String(client),
                        manager: String(p.manager || p.assignedTo || '-'),
                        type: String(p.type || '-'),
                        status: String(p.status || 'Unknown'),
                        monthlyProgress: monthlyProgress && typeof monthlyProgress === 'object' && !Array.isArray(monthlyProgress) ? monthlyProgress : {},
                        // Required for Doc Collection / Compliance / Monthly Data Review % (list may omit; hydration merges)
                        documentSections: p.documentSections,
                        monthlyDataReviewSections: p.monthlyDataReviewSections,
                        complianceReviewSections: p.complianceReviewSections,
                        hasDocumentCollectionProcess: p.hasDocumentCollectionProcess,
                        hasMonthlyDataReviewProcess: p.hasMonthlyDataReviewProcess,
                        hasComplianceReviewProcess: p.hasComplianceReviewProcess
                    };
                } catch (e) {
                    console.warn('⚠️ ProjectProgressTracker: Error mapping project:', p, e);
                    // Return a minimal valid project object to prevent crashes (keep review JSON if present)
                    return {
                        id: String(p?.id || 'unknown'),
                        name: String(p?.name || 'Invalid Project'),
                        client: String(p?.clientName || p?.client || ''),
                        manager: '-',
                        type: String(p?.type || '-'),
                        status: 'Unknown',
                        monthlyProgress: {},
                        monthlyDataReviewSections: p?.monthlyDataReviewSections,
                        complianceReviewSections: p?.complianceReviewSections,
                        hasMonthlyDataReviewProcess: p?.hasMonthlyDataReviewProcess,
                        hasComplianceReviewProcess: p?.hasComplianceReviewProcess
                    };
                }
            });
        }
    } catch (e) {
        console.error('❌ ProjectProgressTracker: Error in safeProjects calculation:', e);
        safeProjects = []; // Always return an array
    }
    
    // Final safety check - ensure safeProjects is always an array
    if (!Array.isArray(safeProjects)) {
        console.error('❌ ProjectProgressTracker: safeProjects is not an array, resetting');
        safeProjects = [];
    }
    
    // Status config
    const getStatusConfig = (status) => {
        const configs = {
            'not-started': { label: 'Not Started', color: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200', cellColor: 'bg-red-50 dark:bg-red-900/40' },
            'data-received': { label: 'Data Received', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200', cellColor: 'bg-orange-50 dark:bg-orange-900/40' },
            'in-progress': { label: 'In Progress', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200', cellColor: 'bg-yellow-50 dark:bg-yellow-900/40' },
            'ready-checking': { label: 'Ready for Checking', color: 'bg-lime-100 text-lime-800 dark:bg-lime-900/50 dark:text-lime-200', cellColor: 'bg-lime-50 dark:bg-lime-900/40' },
            'checked': { label: 'Checked', color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-200', cellColor: 'bg-cyan-50 dark:bg-cyan-900/40' },
            'reports-prepared': { label: 'Reports Prepared', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200', cellColor: 'bg-blue-50 dark:bg-blue-900/40' },
            'done': { label: 'Done', color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200', cellColor: 'bg-green-50 dark:bg-green-900/40' }
        };
        return configs[String(status || '')] || configs['not-started'];
    };
    
    // Get progress data safely - with full error handling
    const getProgressData = (project, month, field) => {
        try {
            if (!project || !month || !field) return '';
            const safeYear = Number(selectedYearRef.current ?? selectedYear) || currentYear;
            if (isNaN(safeYear)) return '';
            
            const key = String(month || '') + '-' + String(safeYear);
            if (!key || key.length < 5) return '';
            
            const progress = project.monthlyProgress || {};
            if (!progress || typeof progress !== 'object' || Array.isArray(progress)) return '';
            
            const monthData = progress[key] || {};
            if (!monthData || typeof monthData !== 'object' || Array.isArray(monthData)) return '';
            
            const fieldData = monthData[field];
            
            // Extract link or text from object, or return string directly
            if (typeof fieldData === 'string') {
                return fieldData;
            } else if (fieldData && typeof fieldData === 'object' && !Array.isArray(fieldData)) {
                // If it's an object, try to get link or text
                return fieldData.link || fieldData.text || '';
            }
            
            return fieldData || '';
        } catch (e) {
            console.warn('⚠️ ProjectProgressTracker: Error in getProgressData:', e);
            return '';
        }
    };

    const parseSectionsPayload = (rawValue) => {
        if (!rawValue) return {};
        if (typeof rawValue === 'object') return rawValue;
        if (typeof rawValue !== 'string') return {};
        let candidate = rawValue;
        for (let i = 0; i < 2; i++) {
            try {
                const parsed = JSON.parse(candidate);
                if (typeof parsed === 'string') {
                    candidate = parsed;
                    continue;
                }
                return parsed && typeof parsed === 'object' ? parsed : {};
            } catch {
                break;
            }
        }
        try {
            return JSON.parse(rawValue);
        } catch {
            return {};
        }
    };

    const getSectionsForYear = (rawSections, year) => {
        const parsed = parseSectionsPayload(rawSections);
        if (!parsed) return [];
        if (Array.isArray(parsed)) return parsed;
        if (typeof parsed !== 'object') return [];
        const yearKey = String(year);
        const byYear = parsed[yearKey];
        if (Array.isArray(byYear)) return byYear;

        // Be tolerant of year keys stored with slight format differences.
        const matchingYearKey = Object.keys(parsed).find((k) => {
            if (k == null) return false;
            const parsedKeyYear = Number.parseInt(String(k), 10);
            return Number.isFinite(parsedKeyYear) && parsedKeyYear === Number(year);
        });
        if (matchingYearKey && Array.isArray(parsed[matchingYearKey])) {
            return parsed[matchingYearKey];
        }

        // Fallback for legacy/misaligned data: use first available year with rows.
        const firstNonEmptyYear = Object.keys(parsed).find(
            (k) => Array.isArray(parsed[k]) && parsed[k].length > 0
        );
        if (firstNonEmptyYear) {
            return parsed[firstNonEmptyYear];
        }

        // Some legacy payloads may store rows directly under `sections`.
        if (Array.isArray(parsed.sections)) return parsed.sections;
        return [];
    };

    const resolveMonthlyDataReviewStatusKey = (status) => {
        if (!status) return '';
        const normalized = String(status).toLowerCase();
        if (normalized === 'in-progress') return 'started-minor-info';
        return normalized;
    };

    const isCompletedReviewStatus = (reviewType, rawStatus) => {
        if (!rawStatus) return false;
        const normalized = String(rawStatus).toLowerCase();
        if (reviewType === 'monthlyDataReview') {
            const statusKey = resolveMonthlyDataReviewStatusKey(normalized);
            return statusKey === 'done' || statusKey === 'complete-issues-outstanding' || statusKey === 'complete';
        }
        if (reviewType === 'complianceReview') {
            return normalized === 'reviewed-in-order' || normalized === 'reviewed-issue';
        }
        return false;
    };

    const shouldExcludeFromMonthlyDataReviewPercent = (sectionName, docName) => {
        const section = String(sectionName || '').trim().toLowerCase();
        const doc = String(docName || '').trim().toLowerCase();
        return /post\s*processing|post\s*process|prost\s*process/i.test(section) ||
            /post\s*processing|post\s*process|prost\s*process/i.test(doc);
    };

    const parsePercentValue = (rawValue) => {
        if (rawValue == null) return null;
        if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
            return Math.max(0, Math.min(100, Math.round(rawValue)));
        }
        const match = String(rawValue).match(/(\d{1,3})(?:\.\d+)?\s*%?/);
        if (!match) return null;
        const parsed = Number.parseFloat(match[1]);
        if (!Number.isFinite(parsed)) return null;
        return Math.max(0, Math.min(100, Math.round(parsed)));
    };

    const getMonthlyProgressPercentFallback = (project, monthName, year, reviewType) => {
        const monthlyProgress = project?.monthlyProgress;
        if (!monthlyProgress || typeof monthlyProgress !== 'object' || Array.isArray(monthlyProgress)) {
            return null;
        }
        const monthKey = `${String(monthName || '')}-${String(year)}`;
        const monthData = monthlyProgress[monthKey];
        if (!monthData || typeof monthData !== 'object' || Array.isArray(monthData)) {
            return null;
        }

        let candidates;
        if (reviewType === 'complianceReview') {
            candidates = [
                monthData.compliancePercent,
                monthData.compliance_percentage,
                monthData.complianceProgressPercent,
                monthData.complianceProgress,
                monthData.compliance
            ];
        } else if (reviewType === 'documentCollection') {
            candidates = [
                monthData.docCollectionPercent,
                monthData.documentCollectionPercent,
                monthData.docCollectionProgressPercent,
                monthData.docCollection,
                monthData.documentCollection
            ];
        } else {
            candidates = [
                monthData.dataPercent,
                monthData.data_percentage,
                monthData.monthlyDataReviewPercent,
                monthData.dataProgressPercent,
                monthData.dataProgress,
                monthData.data
            ];
        }

        for (let i = 0; i < candidates.length; i += 1) {
            const parsed = parsePercentValue(candidates[i]);
            if (parsed != null) return parsed;
        }
        return null;
    };

    const getReviewProgressForMonth = (project, monthName, reviewType) => {
        const safeYear = Number(selectedYear) || currentYear;
        const monthIdx = months.indexOf(monthName);
        const monthNum = monthIdx >= 0 ? monthIdx + 1 : null;
        const isoMonthKey = monthNum != null ? `${safeYear}-${String(monthNum).padStart(2, '0')}` : null;
        const legacyMonthKey = `${String(monthName || '')}-${String(safeYear)}`;
        const sectionsField = reviewType === 'complianceReview' ? project?.complianceReviewSections : project?.monthlyDataReviewSections;
        const yearSections = getSectionsForYear(sectionsField, safeYear);

        if (!Array.isArray(yearSections) || yearSections.length === 0) {
            const fallbackPercent = getMonthlyProgressPercentFallback(project, monthName, safeYear, reviewType);
            return { completed: 0, total: 0, percent: fallbackPercent, source: fallbackPercent != null ? 'monthlyProgress' : 'sections' };
        }

        let total = 0;
        let completed = 0;
        yearSections.forEach((section) => {
            const docs = Array.isArray(section?.documents)
                ? section.documents
                : (Array.isArray(section?.items) ? section.items : []);
            docs.forEach((doc) => {
                if (reviewType === 'monthlyDataReview' && shouldExcludeFromMonthlyDataReviewPercent(section?.name, doc?.name)) {
                    return;
                }
                total += 1;
                const rawStatus =
                    (isoMonthKey ? doc?.collectionStatus?.[isoMonthKey] : null) ??
                    doc?.collectionStatus?.[legacyMonthKey];
                if (isCompletedReviewStatus(reviewType, rawStatus)) {
                    completed += 1;
                }
            });
        });

        const sectionPercent = total > 0 ? Math.round((completed / total) * 100) : null;
        const fallbackPercent = sectionPercent == null
            ? getMonthlyProgressPercentFallback(project, monthName, safeYear, reviewType)
            : null;

        return {
            completed,
            total,
            percent: sectionPercent != null ? sectionPercent : fallbackPercent,
            source: sectionPercent != null ? 'sections' : (fallbackPercent != null ? 'monthlyProgress' : 'sections')
        };
    };

    const isCompletedDocumentCollectionStatus = (rawStatus) => {
        if (!rawStatus) return false;
        const normalized = String(rawStatus).toLowerCase();
        return normalized === 'collected' || normalized === 'available-on-request' || normalized === 'not-required';
    };

    const getDocumentCollectionProgressForMonth = (project, monthName) => {
        const safeYear = Number(selectedYear) || currentYear;
        const monthIdx = months.indexOf(monthName);
        const monthNum = monthIdx >= 0 ? monthIdx + 1 : null;
        const isoMonthKey = monthNum != null ? `${safeYear}-${String(monthNum).padStart(2, '0')}` : null;
        const legacyMonthKey = `${String(monthName || '')}-${String(safeYear)}`;
        const sectionsField = project?.documentSections;
        const yearSections = getSectionsForYear(sectionsField, safeYear);

        if (!Array.isArray(yearSections) || yearSections.length === 0) {
            const fallbackPercent = getMonthlyProgressPercentFallback(project, monthName, safeYear, 'documentCollection');
            return {
                completed: 0,
                total: 0,
                percent: fallbackPercent,
                source: fallbackPercent != null ? 'monthlyProgress' : 'sections'
            };
        }

        let total = 0;
        let completed = 0;
        yearSections.forEach((section) => {
            const docs = Array.isArray(section?.documents) ? section.documents : [];
            docs.forEach((doc) => {
                total += 1;
                const rawStatus =
                    (isoMonthKey ? doc?.collectionStatus?.[isoMonthKey] : null) ??
                    doc?.collectionStatus?.[legacyMonthKey];
                if (isCompletedDocumentCollectionStatus(rawStatus)) {
                    completed += 1;
                }
            });
        });

        const sectionPercent = total > 0 ? Math.round((completed / total) * 100) : null;
        const fallbackPercent =
            sectionPercent == null
                ? getMonthlyProgressPercentFallback(project, monthName, safeYear, 'documentCollection')
                : null;

        return {
            completed,
            total,
            percent: sectionPercent != null ? sectionPercent : fallbackPercent,
            source: sectionPercent != null ? 'sections' : fallbackPercent != null ? 'monthlyProgress' : 'sections'
        };
    };

    const buildProjectReviewLink = (projectId, tab, monthName, monthIndex, year) => {
        try {
            const basePath = `${window.location.origin}${window.location.pathname}`;
            const query = new URLSearchParams();
            if (tab) query.set('tab', tab);
            if (monthName) query.set('month', String(monthName));
            if (typeof monthIndex === 'number' && monthIndex >= 0) query.set('monthIndex', String(monthIndex));
            if (year) query.set('year', String(year));
            return `${basePath}#/projects/${encodeURIComponent(String(projectId))}?${query.toString()}`;
        } catch (error) {
            console.error('❌ ProjectProgressTracker: Failed to build review link:', error);
            return '#/projects';
        }
    };
    
    // Validate progress data before saving
    const validateProgressData = (progress) => {
        try {
            // Ensure it's an object
            if (typeof progress !== 'object' || Array.isArray(progress)) {
                return { valid: false, error: 'Progress data must be an object' };
            }
            
            // Validate structure - each key should be "Month-Year" format
            for (const key in progress) {
                if (typeof progress[key] !== 'object' || Array.isArray(progress[key])) {
                    return { valid: false, error: `Invalid month data structure for ${key}` };
                }
                
                // Each month data should only contain valid fields
                const validFields = ['docCollection', 'compliance', 'data', 'comments'];
                for (const field in progress[key]) {
                    if (!validFields.includes(field)) {
                        console.warn(`⚠️ Unknown field in progress data: ${field}`);
                    }
                    
                    // Values should be strings
                    if (progress[key][field] !== null && typeof progress[key][field] !== 'string') {
                        return { valid: false, error: `Field ${field} must be a string` };
                    }
                }
            }
            
            return { valid: true };
        } catch (e) {
            return { valid: false, error: `Validation error: ${e.message}` };
        }
    };

    const escapeAttributeValue = (value) => {
        return String(value || '')
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"');
    };

    const fetchUsersSafe = async () => {
        if (Array.isArray(usersCacheRef.current) && usersCacheRef.current.length > 0) {
            return usersCacheRef.current;
        }

        if (usersLoadPromiseRef.current) {
            try {
                await usersLoadPromiseRef.current;
                return usersCacheRef.current;
            } catch (error) {
                console.error('❌ ProjectProgressTracker: Error awaiting cached users promise:', error);
                usersLoadPromiseRef.current = null;
            }
        }

        usersLoadPromiseRef.current = (async () => {
            let fetchedUsers = [];
            try {
                if (window.DatabaseAPI && typeof window.DatabaseAPI.getUsers === 'function') {
                    const response = await window.DatabaseAPI.getUsers();
                    fetchedUsers = response?.data?.users || response?.data?.data?.users || response?.users || [];
                } else if (window.api && typeof window.api.getUsers === 'function') {
                    const response = await window.api.getUsers();
                    fetchedUsers = response?.data?.users || response?.users || [];
                }
            } catch (error) {
                console.error('❌ ProjectProgressTracker: Failed to load users for @mentions:', error);
            }

            if (!Array.isArray(fetchedUsers)) {
                fetchedUsers = [];
            }

            usersCacheRef.current = fetchedUsers;
            return fetchedUsers;
        })();

        try {
            return await usersLoadPromiseRef.current;
        } catch (error) {
            console.error('❌ ProjectProgressTracker: Error loading users:', error);
            usersLoadPromiseRef.current = null;
            return usersCacheRef.current || [];
        }
    };

    const buildProgressTrackerLink = (projectId, monthName, monthIndex, year, field = 'comments') => {
        try {
            const basePath = `${window.location.origin}${window.location.pathname}`;
            const params = new URLSearchParams();
            params.set('progressTracker', '1');

            if (projectId) {
                params.set('projectId', String(projectId));
            }

            if (typeof monthIndex === 'number' && !Number.isNaN(monthIndex) && monthIndex >= 0) {
                params.set('monthIndex', String(monthIndex));
            }

            if (monthName) {
                params.set('month', monthName);
            }

            if (year) {
                params.set('year', String(year));
            }

            if (field) {
                params.set('field', field);
            }
            if (field) {
                params.set('focusInput', field);
            }

            return `${basePath}#/projects?${params.toString()}`;
        } catch (error) {
            console.error('❌ ProjectProgressTracker: Failed to build tracker link:', error);
            return '#/projects';
        }
    };

    const processCommentMentions = async (commentText, project, monthName, monthIndex, year, field) => {
        try {
            if (!commentText || !window.MentionHelper || !window.MentionHelper.hasMentions(commentText)) {
                return;
            }

            const allUsers = await fetchUsersSafe();
            if (!Array.isArray(allUsers) || allUsers.length === 0) {
                console.warn('⚠️ ProjectProgressTracker: No users available for @mention notifications');
                return;
            }

            let currentUserInfo = null;
            try {
                if (window.storage && typeof window.storage.getUserInfo === 'function') {
                    currentUserInfo = window.storage.getUserInfo();
                } else if (window.useAuth && typeof window.useAuth === 'function') {
                    currentUserInfo = window.useAuth()?.user || null;
                }
            } catch (error) {
                console.warn('⚠️ ProjectProgressTracker: Unable to determine current user for mention notifications:', error);
            }

            const authorName =
                currentUserInfo?.name ||
                currentUserInfo?.email ||
                'Unknown';

            const safeProjectName = (project && project.name) || 'Project';
            const resolvedMonthIndex =
                typeof monthIndex === 'number' && !Number.isNaN(monthIndex) && monthIndex >= 0
                    ? monthIndex
                    : months.indexOf(String(monthName || ''));
            const resolvedMonthName =
                typeof monthName === 'string' && monthName
                    ? monthName
                    : resolvedMonthIndex >= 0
                        ? months[resolvedMonthIndex]
                        : '';
            const resolvedYear = Number(year) || Number(selectedYear) || currentYear;
            const resolvedField = field || 'comments';

            const contextTitle = `${safeProjectName} • ${resolvedMonthName || 'Progress'} ${resolvedYear}`;
            const contextLink = buildProgressTrackerLink(
                project?.id,
                resolvedMonthName,
                resolvedMonthIndex >= 0 ? resolvedMonthIndex : null,
                resolvedYear,
                resolvedField
            );

            await window.MentionHelper.processMentions(
                commentText,
                contextTitle,
                contextLink,
                authorName,
                allUsers,
                {
                    projectId: project?.id,
                    projectName: safeProjectName,
                    month: resolvedMonthName,
                    monthIndex: resolvedMonthIndex >= 0 ? resolvedMonthIndex : null,
                    year: resolvedYear,
                    field: resolvedField
                }
            );
        } catch (error) {
            console.error('❌ ProjectProgressTracker: Error processing @mentions:', error);
        }
    };
    
    // Save progress data with safety checks
    const saveProgressData = async (project, month, field, value) => {
        // Validate inputs
        if (!project || !project.id) {
            console.error('❌ ProjectProgressTracker: Invalid project for save');
            alert('Invalid project. Cannot save.');
            return;
        }
        
        if (!month || !field) {
            console.error('❌ ProjectProgressTracker: Invalid month or field');
            return;
        }
        
        // Sanitize value - ensure it's a string and limit length for safety
        const sanitizedValue = typeof value === 'string' ? value.slice(0, 5000) : String(value || '').slice(0, 5000);
        
        try {
            setSaving(true);
            const safeYear = Number(selectedYear) || currentYear;
            if (isNaN(safeYear)) {
                throw new Error('Invalid year');
            }
            
            const key = String(month) + '-' + String(safeYear);
            
            // Get current monthlyProgress - preserve all existing data
            const currentProgress = project.monthlyProgress || {};
            
            // Ensure currentProgress is an object (not a string)
            let parsedProgress = currentProgress;
            if (typeof currentProgress === 'string' && currentProgress.trim()) {
                try {
                    parsedProgress = JSON.parse(currentProgress);
                } catch (e) {
                    console.warn('⚠️ ProjectProgressTracker: Failed to parse existing monthlyProgress, creating new:', e);
                    parsedProgress = {};
                }
            }
            
            // Ensure parsedProgress is a valid object
            if (typeof parsedProgress !== 'object' || Array.isArray(parsedProgress)) {
                parsedProgress = {};
            }
            
            // Preserve existing month data for all months
            const currentMonthData = parsedProgress[key] || {};
            
            // Only update the specific field, preserve all other fields in this month
            const updatedMonthData = {
                ...currentMonthData,
                [field]: sanitizedValue
            };
            
            // Preserve all other months' data
            const updatedProgress = {
                ...parsedProgress,
                [key]: updatedMonthData
            };
            
            // Validate before saving
            const validation = validateProgressData(updatedProgress);
            if (!validation.valid) {
                throw new Error(`Data validation failed: ${validation.error}`);
            }
            
            // Store backup of current state before update
            const backupProgress = JSON.parse(JSON.stringify(parsedProgress));
            
            // Clear cache BEFORE updating to ensure fresh data after save
            if (window.DatabaseAPI) {
                // Clear response cache - clear ALL project-related caches
                if (window.DatabaseAPI._responseCache) {
                    // Clear all project caches
                    const keysToDelete = [];
                    window.DatabaseAPI._responseCache.forEach((value, key) => {
                        if (key.includes('/projects')) {
                            keysToDelete.push(key);
                        }
                    });
                    keysToDelete.forEach(key => {
                        window.DatabaseAPI._responseCache.delete(key);
                    });
                }
                // Also clear any pending requests to avoid stale data
                if (window.DatabaseAPI._pendingRequests) {
                    const pendingKeysToDelete = [];
                    window.DatabaseAPI._pendingRequests.forEach((value, key) => {
                        if (key.includes('/projects')) {
                            pendingKeysToDelete.push(key);
                        }
                    });
                    pendingKeysToDelete.forEach(key => {
                        window.DatabaseAPI._pendingRequests.delete(key);
                    });
                }
            }
            
            // Update project via API - only send monthlyProgress field to prevent overwriting other fields
            const updatePayload = {
                monthlyProgress: JSON.stringify(updatedProgress)
            };
            
            
            let updateSuccess = false;
            let apiError = null;
            let savedProject = null;
            
            try {
                // Verify API is available
                if (!window.DatabaseAPI && !window.api) {
                    throw new Error('Database API not available. Please refresh the page.');
                }
                
                
                let response;
                // Prefer dedicated monthly progress endpoint if available
                if (window.DatabaseAPI && typeof window.DatabaseAPI.updateProjectMonthlyProgress === 'function') {
                    response = await window.DatabaseAPI.updateProjectMonthlyProgress(
                        project.id,
                        updatePayload.monthlyProgress
                    );
                } else if (window.DatabaseAPI && typeof window.DatabaseAPI.updateProject === 'function') {
                    response = await window.DatabaseAPI.updateProject(project.id, updatePayload);
                } else if (window.api && typeof window.api.updateProject === 'function') {
                    response = await window.api.updateProject(project.id, updatePayload);
                } else {
                    throw new Error('Update API not available');
                }
                
                
                // Verify the response contains the saved data
                const responseMonthlyProgress = response?.data?.project?.monthlyProgress || response?.project?.monthlyProgress;
                if (responseMonthlyProgress) {
                    let parsedResponseProgress = responseMonthlyProgress;
                    if (typeof parsedResponseProgress === 'string') {
                        try {
                            parsedResponseProgress = JSON.parse(parsedResponseProgress);
                        } catch (e) {
                            console.error('❌ ProjectProgressTracker: Failed to parse monthlyProgress from API response:', e);
                        }
                    }
                    const responseValue = parsedResponseProgress?.[key]?.[field];
                    
                    if (responseValue !== sanitizedValue) {
                        console.error('❌ ProjectProgressTracker: CRITICAL - API response does not contain saved data!', {
                            expected: sanitizedValue,
                            received: responseValue,
                            monthKey: key,
                            field: field
                        });
                    }
                } else {
                    console.warn('⚠️ ProjectProgressTracker: API response does not contain monthlyProgress field');
                }
                
                // Validate response
                if (!response) {
                    throw new Error('API returned empty response');
                }
                
                savedProject = response?.data?.project || response?.project || response?.data;
                
                // Log the full response to debug
                
                if (!savedProject) {
                    console.warn('⚠️ ProjectProgressTracker: API response does not contain project data');
                    // Still mark as success if we got a response - the data might be in the database
                    updateSuccess = true;
                } else {
                    // Verify monthlyProgress is in the response
                    const responseMonthlyProgress = savedProject.monthlyProgress;
                    updateSuccess = true;
                }
            } catch (apiErr) {
                apiError = apiErr;
                console.error('❌ ProjectProgressTracker: API update failed:', apiErr);
                console.error('❌ ProjectProgressTracker: Error details:', {
                    message: apiErr?.message,
                    stack: apiErr?.stack,
                    name: apiErr?.name,
                    projectId: project.id,
                    payload: updatePayload
                });
                
                // Restore backup on failure
                setProjects(prevProjects => prevProjects.map(p => 
                    String(p?.id) === String(project.id)
                        ? { ...p, monthlyProgress: backupProgress }
                        : p
                ));
                
                throw apiErr;
            }
            
            if (updateSuccess) {
                // Update local state with saved data (use API response if available, otherwise use local update)
                let finalProgress = updatedProgress;
                
                // Try to get monthlyProgress from saved project
                const savedMonthlyProgress = savedProject?.monthlyProgress;
                
                if (savedMonthlyProgress) {
                    try {
                        // Parse if it's a string, otherwise use directly
                        finalProgress = typeof savedMonthlyProgress === 'string' 
                            ? JSON.parse(savedMonthlyProgress) 
                            : savedMonthlyProgress;
                        
                        // Validate that we got valid data
                        if (typeof finalProgress !== 'object' || Array.isArray(finalProgress)) {
                            console.warn('⚠️ ProjectProgressTracker: Parsed monthlyProgress is not an object, using local update');
                            finalProgress = updatedProgress;
                        } else {
                        }
                    } catch (parseErr) {
                        console.warn('⚠️ ProjectProgressTracker: Failed to parse saved project monthlyProgress, using local update:', parseErr);
                        finalProgress = updatedProgress;
                    }
                } else {
                    // API response doesn't have monthlyProgress, use our local update (which is correct)
                    finalProgress = updatedProgress;
                }
                
                
                // Update the project reference directly
                try {
                    project.monthlyProgress = finalProgress;
                } catch (syncErr) {
                    console.warn('⚠️ ProjectProgressTracker: Failed to sync project reference after save:', syncErr);
                }
                
                // Update state with the saved data - use String comparison for IDs
                setProjects(prevProjects => prevProjects.map(p => {
                    if (String(p?.id) === String(project.id)) {
                        return { ...p, monthlyProgress: finalProgress };
                    }
                    return p;
                }));

                if (field === 'comments') {
                    const safeMonthName = String(month || '');
                    const monthIdx = months.indexOf(safeMonthName);
                    processCommentMentions(
                        sanitizedValue,
                        project,
                        safeMonthName,
                        monthIdx,
                        safeYear,
                        field
                    );
                }
                
                // CRITICAL: Reload projects from database after successful save to ensure persistence
                // This ensures that when the component remounts or user navigates away and back, data is there
                try {
                    // Wait a bit for the database to commit the transaction
                    // Increased delay to ensure database has time to commit
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    
                    // Clear cache again before reload to ensure fresh data
                    if (window.DatabaseAPI) {
                        if (window.DatabaseAPI._responseCache) {
                            window.DatabaseAPI._responseCache.delete('GET:/projects');
                            window.DatabaseAPI._responseCache.delete(`GET:/projects/${project.id}`);
                        }
                        if (window.DatabaseAPI._pendingRequests) {
                            window.DatabaseAPI._pendingRequests.delete('/projects');
                            window.DatabaseAPI._pendingRequests.delete(`/projects/${project.id}`);
                        }
                    }
                    
                    // First, directly fetch the updated project to verify it's in the database
                    if (window.DatabaseAPI && window.DatabaseAPI.getProject) {
                        try {
                            const directProjectResponse = await window.DatabaseAPI.getProject(project.id);
                            const directProject = directProjectResponse?.data?.project || directProjectResponse?.project || directProjectResponse?.data;
                            
                            if (directProject) {
                                let directMonthlyProgress = directProject.monthlyProgress;
                                if (typeof directMonthlyProgress === 'string' && directMonthlyProgress.trim()) {
                                    try {
                                        directMonthlyProgress = JSON.parse(directMonthlyProgress);
                                    } catch (e) {
                                        console.warn('⚠️ ProjectProgressTracker: Failed to parse direct project monthlyProgress:', e);
                                        directMonthlyProgress = {};
                                    }
                                }
                                
                                const directMonthData = directMonthlyProgress?.[key];
                                const directFieldValue = directMonthData?.[field];
                                
                                
                                if (directFieldValue !== sanitizedValue) {
                                    console.error('❌ ProjectProgressTracker: CRITICAL - Saved value does not match database value!', {
                                        expected: sanitizedValue,
                                        actual: directFieldValue,
                                        monthKey: key,
                                        field: field
                                    });
                                } else {
                                }
                            } else {
                                console.warn('⚠️ ProjectProgressTracker: Direct project fetch returned no data');
                            }
                        } catch (directFetchErr) {
                            console.warn('⚠️ ProjectProgressTracker: Failed to directly fetch project (non-critical):', directFetchErr);
                        }
                    }
                    
                    if (window.DatabaseAPI && window.DatabaseAPI.getProjects) {
                        const reloadResponse = await window.DatabaseAPI.getProjects({ forceRefresh: true });
                        let reloadedProjs = [];
                        
                        if (reloadResponse?.data?.projects && Array.isArray(reloadResponse.data.projects)) {
                            reloadedProjs = reloadResponse.data.projects;
                        } else if (reloadResponse?.data?.data?.projects && Array.isArray(reloadResponse.data.data.projects)) {
                            reloadedProjs = reloadResponse.data.data.projects;
                        } else if (reloadResponse?.projects && Array.isArray(reloadResponse.projects)) {
                            reloadedProjs = reloadResponse.projects;
                        } else if (Array.isArray(reloadResponse?.data)) {
                            reloadedProjs = reloadResponse.data;
                        } else if (Array.isArray(reloadResponse)) {
                            reloadedProjs = reloadResponse;
                        }
                        
                        // Normalize and filter projects
                        const normalizedReloaded = (Array.isArray(reloadedProjs) ? reloadedProjs : []).map(p => {
                            let monthlyProgress = p.monthlyProgress;
                            if (typeof monthlyProgress === 'string' && monthlyProgress.trim()) {
                                try {
                                    monthlyProgress = JSON.parse(monthlyProgress);
                                } catch (e) {
                                    monthlyProgress = {};
                                }
                            }
                            return {
                                ...p,
                                client: p.clientName || p.client || '',
                                monthlyProgress: monthlyProgress && typeof monthlyProgress === 'object' && !Array.isArray(monthlyProgress) ? monthlyProgress : {}
                            };
                        });
                        
                        const monthlyReloaded = normalizedReloaded.filter(p => {
                            if (!p || typeof p !== 'object') return false;
                            if (p.monthlyProgress && typeof p.monthlyProgress === 'object' && Object.keys(p.monthlyProgress).length > 0) {
                                return true;
                            }
                            const rawType = p.type;
                            if (rawType !== null && rawType !== undefined) {
                                try {
                                    const projectType = String(rawType || '').toUpperCase().trim();
                                    if (projectType.length > 0 && projectType.startsWith('MONTHLY')) {
                                        return true;
                                    }
                                } catch (e) {}
                            }
                            return false;
                        });
                        
                        // Verify the saved data is in the reloaded projects
                        const reloadedProject = monthlyReloaded.find(p => String(p?.id) === String(project.id));
                        if (reloadedProject) {
                            const reloadedMonthlyProgress = reloadedProject.monthlyProgress || {};
                            const savedMonthKey = key;
                            const savedFieldValue = reloadedMonthlyProgress[savedMonthKey]?.[field];
                            
                            if (savedFieldValue !== sanitizedValue) {
                                console.error('❌ ProjectProgressTracker: CRITICAL - Saved value does not match reloaded value!', {
                                    saved: sanitizedValue,
                                    reloaded: savedFieldValue,
                                    monthKey: savedMonthKey,
                                    field: field,
                                    fullMonthData: reloadedMonthlyProgress[savedMonthKey]
                                });
                                
                                // Try fetching the project directly from the database
                                try {
                                    if (window.DatabaseAPI && window.DatabaseAPI.getProject) {
                                        const directProject = await window.DatabaseAPI.getProject(project.id);
                                        const directMonthlyProgress = directProject?.data?.project?.monthlyProgress || directProject?.project?.monthlyProgress;
                                        let parsedDirect = directMonthlyProgress;
                                        if (typeof parsedDirect === 'string') {
                                            parsedDirect = JSON.parse(parsedDirect);
                                        }
                                        const directValue = parsedDirect?.[savedMonthKey]?.[field];
                                        
                                        if (directValue === sanitizedValue) {
                                            // Update the reloaded project with correct data
                                            const correctedProject = {
                                                ...reloadedProject,
                                                monthlyProgress: parsedDirect
                                            };
                                            setProjects(prevProjects => prevProjects.map(p => 
                                                String(p?.id) === String(project.id) ? correctedProject : p
                                            ));
                                        } else {
                                            console.error('❌ ProjectProgressTracker: Data NOT in database! Save may have failed.');
                                        }
                                    }
                                } catch (directFetchErr) {
                                    console.error('❌ ProjectProgressTracker: Failed to fetch project directly:', directFetchErr);
                                }
                            } else {
                            }
                        } else {
                            console.warn('⚠️ ProjectProgressTracker: Saved project not found in reloaded projects!', {
                                projectId: project.id,
                                reloadedCount: monthlyReloaded.length,
                                reloadedIds: monthlyReloaded.map(p => p.id)
                            });
                        }
                        
                        // Update state with reloaded data
                        setProjects(Array.isArray(monthlyReloaded) ? monthlyReloaded : []);
                    }
                } catch (reloadErr) {
                    console.warn('⚠️ ProjectProgressTracker: Failed to reload projects after save (non-critical):', reloadErr);
                    // Don't fail the save if reload fails - the local state update above should be sufficient
                }
                
                // Optional: Show a brief success message (you can replace with a toast notification)
                // For now, we'll just log it - the UI update should be visible immediately
            }
        } catch (e) {
            console.error('❌ ProjectProgressTracker: Error saving progress data:', e);
            const errorMessage = e.message || 'Failed to save. Please try again.';
            
            // Show detailed error to user
            const detailedError = `Save failed: ${errorMessage}\n\n` +
                `Project: ${project?.name || project?.id || 'Unknown'}\n` +
                `Month: ${month}\n` +
                `Field: ${field}\n\n` +
                `Please check the browser console for more details.`;
            
            alert(detailedError);
        } finally {
            setSaving(false);
        }
    };

    saveProgressDataRef.current = saveProgressData;

    const COMMENT_AUTOSAVE_DEBOUNCE_MS = 500;

    const flushPendingCommentSave = async () => {
        if (commentAutosaveTimerRef.current) {
            clearTimeout(commentAutosaveTimerRef.current);
            commentAutosaveTimerRef.current = null;
        }
        const ec = editingCellRef.current;
        if (!ec || ec.field !== 'comments') return;
        const proj = projectsRef.current.find((p) => String(p.id) === String(ec.projectId));
        if (!proj) return;
        const value = editingValueRef.current;
        const prev = getProgressData(proj, ec.month, 'comments');
        if (String(value || '') === String(prev || '')) return;
        await saveProgressData(proj, ec.month, 'comments', value);
    };

    flushPendingCommentSaveRef.current = flushPendingCommentSave;

    const scheduleCommentAutosave = () => {
        if (commentAutosaveTimerRef.current) {
            clearTimeout(commentAutosaveTimerRef.current);
        }
        commentAutosaveTimerRef.current = setTimeout(() => {
            commentAutosaveTimerRef.current = null;
            void flushPendingCommentSave();
        }, COMMENT_AUTOSAVE_DEBOUNCE_MS);
    };

    // Flush on refresh / tab hide / unmount — same lifecycle pattern as Monthly Data checklist notes
    useEffect(() => {
        const onBeforeUnload = (event) => {
            const ec = editingCellRef.current;
            if (!ec || ec.field !== 'comments') return;
            const proj = projectsRef.current.find((p) => String(p.id) === String(ec.projectId));
            if (!proj) return;
            const val = editingValueRef.current;
            const prev = getProgressData(proj, ec.month, 'comments');
            if (String(val || '') === String(prev || '')) return;
            if (commentAutosaveTimerRef.current) {
                clearTimeout(commentAutosaveTimerRef.current);
                commentAutosaveTimerRef.current = null;
            }
            void saveProgressDataRef.current?.(proj, ec.month, 'comments', val);
            event.preventDefault();
            event.returnValue = '';
        };
        const onHidden = () => {
            if (document.visibilityState === 'hidden') {
                void flushPendingCommentSaveRef.current?.();
            }
        };
        const onPageHide = () => {
            void flushPendingCommentSaveRef.current?.();
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        document.addEventListener('visibilitychange', onHidden);
        window.addEventListener('pagehide', onPageHide);
        return () => {
            window.removeEventListener('beforeunload', onBeforeUnload);
            document.removeEventListener('visibilitychange', onHidden);
            window.removeEventListener('pagehide', onPageHide);
        };
    }, []);

    useEffect(() => {
        return () => {
            void flushPendingCommentSaveRef.current?.();
        };
    }, []);
    
    // Render progress cell — comments use an always-visible textarea (focus and type; no separate step)
    const renderProgressCell = (project, month, field, rowBgColor = '#ffffff', providedKey = null) => {
        // Validate inputs
        if (!project || !project.id || !month || !field) {
            const defaultBgColor = rowBgColor === '#ffffff' ? '#ffffff' : '#f3f4f6';
            return React.createElement('td', {
                style: {
                    backgroundColor: defaultBgColor,
                    border: '1px solid #d1d5db'
                },
                className: 'px-2 py-1 text-xs'
            }, React.createElement('span', { className: 'text-gray-400 text-[10px]' }, '-'));
        }
        
        const safeMonth = String(month || '');
        const monthIdx = months.indexOf(safeMonth);
        const isWorking = isWorkingMonthForYear(monthIdx, Number(selectedYear));
        const cellKey = `${project.id}-${safeMonth}-${field}`;
        const cellIdentifier = providedKey || cellKey;
        const isFocusedCell = focusedCellKey === cellIdentifier;
        
        // Get current value from project data
        const currentValue = getProgressData(project, safeMonth, field);
        const displayValue = currentValue || '';
        const hasValue = displayValue && displayValue.trim().length > 0;
        let reviewProgress = null;
        let monthReviewLink = null;
        if (field === 'docCollection') {
            reviewProgress = getDocumentCollectionProgressForMonth(project, safeMonth);
            monthReviewLink = buildProjectReviewLink(
                project.id,
                'documentCollection',
                safeMonth,
                monthIdx,
                Number(selectedYear) || currentYear
            );
        } else {
            const reviewTypeByField = {
                compliance: 'complianceReview',
                data: 'monthlyDataReview'
            };
            const reviewType = reviewTypeByField[field] || null;
            reviewProgress = reviewType ? getReviewProgressForMonth(project, safeMonth, reviewType) : null;
            monthReviewLink = reviewType
                ? buildProjectReviewLink(
                    project.id,
                    reviewType,
                    safeMonth,
                    monthIdx,
                    Number(selectedYear) || currentYear
                )
                : null;
        }
        const reviewPercent = reviewProgress?.percent;
        
        /** Claim this comments cell — flush debounced draft from previous cell first (checklist-style). */
        const beginCommentEditIfNeeded = async () => {
            if (field !== 'comments') return;
            await flushPendingCommentSave();
            const alreadyThis =
                editingCell &&
                String(editingCell.projectId) === String(project.id) &&
                editingCell.month === safeMonth &&
                editingCell.field === 'comments';
            if (alreadyThis) return;
            setEditingCell({
                projectId: project.id,
                month: safeMonth,
                field: 'comments'
            });
            setEditingValue(displayValue);
        };

        const handleCommentFocus = () => {
            void beginCommentEditIfNeeded();
        };

        const handleCommentChange = async (e) => {
            if (field !== 'comments') return;
            const v = e.target.value;
            const isThis =
                editingCell &&
                String(editingCell.projectId) === String(project.id) &&
                editingCell.month === safeMonth &&
                editingCell.field === 'comments';
            if (isThis) {
                setEditingValue(v);
                return;
            }
            if (editingCell) {
                const editingProject = safeProjects.find(p => String(p.id) === String(editingCell.projectId));
                if (editingProject) {
                    await saveProgressData(editingProject, editingCell.month, editingCell.field, editingValue);
                }
            }
            setEditingCell({
                projectId: project.id,
                month: safeMonth,
                field: 'comments'
            });
            setEditingValue(v);
        };

        const handleCommentCellClick = (e) => {
            if (field !== 'comments') return;
            if (e.target.closest && e.target.closest('textarea')) return;
            void beginCommentEditIfNeeded();
            requestAnimationFrame(() => {
                try {
                    const ta = e.currentTarget.querySelector('textarea');
                    if (ta) ta.focus();
                } catch (err) {
                    /* ignore */
                }
            });
        };
        
        // Handle inline input change
        const handleInlineInputChange = (e) => {
            setEditingValue(e.target.value);
        };
        
        // Handle inline input blur - save and stop editing
        const handleInlineInputBlur = async () => {
            if (
                editingCell &&
                String(editingCell.projectId) === String(project.id) &&
                editingCell.month === safeMonth &&
                editingCell.field === field
            ) {
                if (field === 'comments') {
                    if (commentAutosaveTimerRef.current) {
                        clearTimeout(commentAutosaveTimerRef.current);
                        commentAutosaveTimerRef.current = null;
                    }
                    await flushPendingCommentSave();
                } else {
                    await saveProgressData(project, safeMonth, field, editingValue);
                }
                setEditingCell(null);
                setEditingValue('');
            }
        };
        
        // Handle inline input key down (comments: multi-line textarea — Enter = newline; Cmd/Ctrl+Enter saves)
        const handleInlineInputKeyDown = (e) => {
            if (field === 'comments') {
                if (e.key === 'Escape') {
                    if (commentAutosaveTimerRef.current) {
                        clearTimeout(commentAutosaveTimerRef.current);
                        commentAutosaveTimerRef.current = null;
                    }
                    setEditingCell(null);
                    setEditingValue('');
                } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleInlineInputBlur();
                }
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                handleInlineInputBlur();
            } else if (e.key === 'Escape') {
                setEditingCell(null);
                setEditingValue('');
            }
        };
        
        // Field-specific styling — distinct but restrained accents for scanability
        const fieldConfig = {
            docCollection: {
                icon: 'fa-clipboard-list',
                accent: '#0284c7',
                color: '#0c4a6e',
                bgColor: hasValue ? '#e0f2fe' : '#f0f9ff',
                hoverBg: '#bae6fd',
                borderColor: hasValue ? '#38bdf8' : '#7dd3fc',
                barColor: '#0ea5e9',
                label: 'Monthly Doc Collection',
                placeholder: 'Open checklist'
            },
            compliance: {
                icon: 'fa-shield-check',
                accent: '#4f46e5',
                color: '#3730a3',
                bgColor: hasValue ? '#eef2ff' : '#f5f3ff',
                hoverBg: '#e0e7ff',
                borderColor: hasValue ? '#a5b4fc' : '#c7d2fe',
                barColor: '#6366f1',
                label: 'Compliance Review',
                placeholder: 'Open review'
            },
            data: {
                icon: 'fa-database',
                accent: '#0f766e',
                color: '#115e59',
                bgColor: hasValue ? '#ecfdf5' : '#f0fdfa',
                hoverBg: '#ccfbf1',
                borderColor: hasValue ? '#5eead4' : '#99f6e4',
                barColor: '#14b8a6',
                label: 'Monthly Data Review',
                placeholder: 'Open review'
            },
            comments: {
                icon: 'fa-comment-dots',
                accent: '#b45309',
                color: '#9a3412',
                bgColor: hasValue ? '#fffbeb' : '#fefce8',
                hoverBg: '#fef3c7',
                borderColor: hasValue ? '#fcd34d' : '#fde68a',
                barColor: '#d97706',
                label: 'Comments',
                placeholder: 'Add comments'
            }
        };
        
        const config = fieldConfig[field] || fieldConfig.docCollection;
        
        const defaultBgColor = rowBgColor === '#ffffff' ? '#ffffff' : '#f8fafc';
        let calculatedBackground = defaultBgColor;
        if (isFocusedCell) {
            calculatedBackground = config.bgColor;
        } else if (isWorking) {
            const light = rowBgColor === '#ffffff';
            if (field === 'docCollection') calculatedBackground = light ? '#e0f2fe' : '#d6ebfa';
            else if (field === 'compliance') calculatedBackground = light ? '#eef2ff' : '#e8eaf6';
            else if (field === 'data') calculatedBackground = light ? '#ecfdf5' : '#dff7f2';
            else calculatedBackground = light ? '#fffbeb' : '#fef6e0';
        }
        
        const isEditing =
            editingCell &&
            String(editingCell.projectId) === String(project.id) &&
            editingCell.month === safeMonth &&
            editingCell.field === field;
        
        const monthCount = Array.isArray(months) ? months.length : 0;
        const isMonthGroupRightEdge =
            field === 'comments' &&
            monthIdx >= 0 &&
            monthCount > 0 &&
            monthIdx < monthCount - 1;
        
        const cellStyle = {
            padding: '8px 10px',
            border: 'none',
            borderBottom: '1px solid #e5e7eb',
            borderRight: isMonthGroupRightEdge ? TRACK_MONTH_SEPARATOR_BORDER : '1px solid #e5e7eb',
            backgroundColor: calculatedBackground,
            minHeight: '100px',
            height: '100px',
            verticalAlign: 'top',
            width: `${TRACK_CELL_WIDTH}px`,
            minWidth: `${TRACK_CELL_WIDTH}px`,
            maxWidth: `${TRACK_CELL_WIDTH}px`,
            transition: 'background-color 0.2s ease, box-shadow 0.2s ease',
            position: 'relative',
            boxShadow: isFocusedCell ? `0 0 0 2px ${config.accent}55` : 'none',
            cursor: isEditing ? 'text' : (field === 'comments' ? 'text' : 'default')
        };
        
        // Render cell — comments: always a textarea (focus / tab to type); compliance/data unchanged
        return React.createElement('td', {
            key: cellIdentifier,
            style: cellStyle,
            className: 'relative group',
            'data-cell-key': cellIdentifier,
            'data-project-id': project.id,
            'data-month-name': safeMonth,
            'data-month-index': monthIdx >= 0 ? String(monthIdx) : '',
            'data-field': field,
            onClick: field === 'comments' ? handleCommentCellClick : undefined,
            onMouseEnter: !isEditing ? (e) => {
                e.currentTarget.style.backgroundColor = config.hoverBg;
            } : undefined,
            onMouseLeave: !isEditing ? (e) => {
                e.currentTarget.style.backgroundColor = calculatedBackground;
            } : undefined
        }, React.createElement('div', { 
            style: { 
                position: 'relative', 
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
            } 
        },
            // Field label with icon
            React.createElement('div', {
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '10px',
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: config.color,
                    marginBottom: '2px'
                }
            },
                React.createElement('i', { className: `fas ${config.icon}`, style: { fontSize: '10px', color: config.accent } }),
                React.createElement('span', null, config.label)
            ),
            // Content area: comments are always a real textarea — tab/focus and type (no extra "open" step)
            field === 'comments' ? (
                React.createElement('textarea', {
                    value: isEditing ? editingValue : displayValue,
                    onFocus: handleCommentFocus,
                    onChange: handleCommentChange,
                    onBlur: handleInlineInputBlur,
                    onKeyDown: handleInlineInputKeyDown,
                    placeholder: config.placeholder,
                    autoFocus: focusedCellKey === cellIdentifier,
                    rows: 4,
                    style: {
                        width: '100%',
                        flex: 1,
                        minHeight: '72px',
                        padding: '6px 8px',
                        fontSize: '11px',
                        fontFamily: 'inherit',
                        lineHeight: '1.35',
                        border: `1.5px solid ${hasValue ? config.borderColor : '#e5e7eb'}`,
                        borderRadius: '4px',
                        backgroundColor: '#ffffff',
                        color: '#111827',
                        outline: 'none',
                        boxShadow: isEditing ? `0 0 0 2px ${config.accent}40` : 'none',
                        resize: 'vertical'
                    }
                })
            ) : isEditing && (field === 'compliance' || field === 'data' || field === 'docCollection') ? (
                React.createElement('input', {
                    type: 'text',
                    value: editingValue,
                    onChange: handleInlineInputChange,
                    onBlur: handleInlineInputBlur,
                    onKeyDown: handleInlineInputKeyDown,
                    placeholder: config.placeholder,
                    autoFocus: true,
                    style: {
                        width: '100%',
                        flex: 1,
                        padding: '4px 6px',
                        fontSize: '11px',
                        fontFamily: 'inherit',
                        border: `1.5px solid ${config.borderColor}`,
                        borderRadius: '4px',
                        backgroundColor: '#ffffff',
                        color: '#111827',
                        outline: 'none',
                        boxShadow: `0 0 0 2px ${config.accent}40`
                    }
                })
            ) : (field === 'compliance' || field === 'data' || field === 'docCollection') ? (
                React.createElement('div', {
                    style: {
                        width: '100%',
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        justifyContent: 'space-between'
                    }
                },
                    React.createElement('button', {
                        type: 'button',
                        onClick: (e) => {
                            e.stopPropagation();
                            if (monthReviewLink && monthReviewLink !== '#/projects') {
                                window.open(monthReviewLink, '_blank', 'noopener,noreferrer');
                            }
                        },
                        style: {
                            width: '100%',
                            padding: '6px 10px',
                            fontSize: '11px',
                            fontWeight: '600',
                            borderRadius: '6px',
                            border: `1px solid ${config.accent}`,
                            backgroundColor: '#ffffff',
                            color: '#1e293b',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)'
                        },
                        title: `Open ${config.label}`
                    },
                        React.createElement('i', { className: 'fas fa-external-link-alt', style: { fontSize: '10px', color: config.accent } }),
                        React.createElement('span', null, field === 'docCollection' ? 'Open checklist' : 'Open Review')
                    ),
                    React.createElement('div', {
                        style: {
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: '11px',
                            color: '#64748b',
                            padding: '4px 0',
                            borderTop: `1px solid ${config.borderColor}`,
                            borderBottom: `1px solid ${config.borderColor}`
                        }
                    },
                        React.createElement('span', {
                            style: {
                                fontWeight: '800',
                                fontSize: '20px',
                                color: config.accent,
                                letterSpacing: '-0.02em',
                                lineHeight: '1'
                            }
                        }, reviewPercent == null ? '--%' : `${reviewPercent}%`),
                        React.createElement(
                            'span',
                            { style: { fontSize: '11px', color: '#475569', fontWeight: '500' } },
                            reviewProgress?.total > 0
                                ? `${reviewProgress.completed}/${reviewProgress.total}`
                                : (reviewProgress?.source === 'monthlyProgress' ? 'From monthly progress' : 'No items')
                        )
                    ),
                    React.createElement('div', {
                        style: {
                            width: '100%',
                            height: '7px',
                            borderRadius: '999px',
                            backgroundColor: '#e2e8f0',
                            overflow: 'hidden'
                        }
                    },
                        React.createElement('div', {
                            style: {
                                width: `${reviewPercent == null ? 0 : reviewPercent}%`,
                                height: '100%',
                                backgroundColor: config.barColor,
                                transition: 'width 0.25s ease'
                            }
                        })
                    )
                )
            ) : null,
            // Status indicator dot for saved comments (hidden while editing inline)
            hasValue && !isEditing && (field === 'comments' || !displayValue.trim()) ? React.createElement('div', {
                style: {
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: config.accent,
                    boxShadow: `0 0 0 2px ${calculatedBackground}`,
                    zIndex: 5
                }
            }) : null
        ));
    };
    
    // Safe year
    const safeYear = Number(selectedYear) || currentYear;
    
    // Year options
    const yearOptions = [];
    for (let i = currentYear - 5; i <= currentYear + 5; i++) {
        if (typeof i === 'number' && !isNaN(i)) {
            yearOptions.push(Number(i));
        }
    }
    
    // Main render using React.createElement
    return React.createElement('div', { className: 'space-y-4 p-4 md:p-6' },
        // Modern Header with Card Design
        React.createElement('div', { 
            className: 'bg-white rounded-xl shadow-sm border border-slate-200/80 p-4 md:p-6',
            style: { backgroundImage: 'linear-gradient(135deg, #ffffff 0%, #f1f5f9 55%, #eef2ff 100%)' }
        },
            React.createElement('div', { className: 'flex flex-col md:flex-row md:items-center md:justify-between gap-4' },
                React.createElement('div', { className: 'flex items-center gap-3' },
                    React.createElement('button', {
                        onClick: onBack,
                        className: 'p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all duration-200 hover:scale-105 active:scale-95',
                        style: { minWidth: '40px', minHeight: '40px' }
                    }, React.createElement('i', { className: 'fas fa-arrow-left text-lg' })),
                    React.createElement('div', null,
                        React.createElement('h1', { 
                            className: 'text-2xl md:text-3xl font-bold text-gray-900 mb-2',
                            style: { letterSpacing: '-0.02em' }
                        }, 'Project Progress Tracker'),
                        React.createElement('p', { className: 'text-sm text-gray-600 flex items-center gap-2' },
                            React.createElement('i', { className: 'fas fa-info-circle text-xs text-blue-500' }),
                            'Track monthly progress with emphasis on the previous two months'
                        )
                    )
                ),
                React.createElement('div', { className: 'flex items-center gap-3' },
                    React.createElement('div', { className: 'flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200' },
                        React.createElement('i', { className: 'fas fa-calendar-alt text-gray-400 text-sm' }),
                        React.createElement('label', { className: 'text-sm font-medium text-gray-700' }, 'Year:'),
                        React.createElement('select', {
                            value: String(safeYear),
                            onChange: (e) => {
                                const newYear = parseInt(e.target.value);
                                if (!isNaN(newYear)) setSelectedYear(newYear);
                            },
                            className: 'ml-1 px-3 py-1.5 text-sm font-semibold border-0 bg-transparent text-gray-900 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 rounded',
                            style: { appearance: 'none', backgroundImage: 'none' }
                        }, (Array.isArray(yearOptions) ? yearOptions : []).map(y => 
                            React.createElement('option', { key: String(y), value: String(y) }, String(y) + (y === currentYear ? ' (Current)' : ''))
                        ))
                    ),
                    React.createElement('button', {
                        onClick: () => {
                            // Export functionality can be added here
                        },
                        className: 'px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all duration-200 hover:shadow-md active:scale-95 flex items-center gap-2',
                    },
                        React.createElement('i', { className: 'fas fa-file-excel' }),
                        React.createElement('span', { className: 'hidden md:inline' }, 'Export')
                    )
                )
            )
        ),
        // Error state - Modern Design
        loadError ? React.createElement('div', { 
            className: 'bg-red-50 border-l-4 border-red-500 rounded-lg p-4 shadow-sm'
        },
            React.createElement('div', { className: 'flex items-start gap-3' },
                React.createElement('i', { className: 'fas fa-exclamation-circle text-red-500 text-xl mt-0.5' }),
                React.createElement('div', { className: 'flex-1' },
                    React.createElement('p', { className: 'text-red-800 font-semibold mb-1' }, 'Error loading projects'),
                    React.createElement('p', { className: 'text-red-600 text-sm mb-3' }, String(loadError)),
                    React.createElement('button', {
                        onClick: () => window.location.reload(),
                        className: 'px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors'
                    }, 'Reload Page')
                )
            )
        ) : null,
        // Working Months Info - Modern Badge Design
        React.createElement('div', { 
            className: 'flex flex-col md:flex-row md:items-center gap-3 p-4 rounded-xl border border-indigo-100',
            style: { background: 'linear-gradient(90deg, #f8fafc 0%, #eef2ff 40%, #f0fdfa 100%)' }
        },
            React.createElement('div', {
                className: 'px-4 py-2 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm',
                style: {
                    flexShrink: 0,
                    background: 'linear-gradient(135deg, #4338ca 0%, #6366f1 100%)'
                }
            },
                React.createElement('i', { className: 'fas fa-calendar-check' }),
                React.createElement('span', null, 'Working Months')
            ),
            React.createElement('div', { className: 'flex-1 flex items-center gap-2' },
                React.createElement('i', { className: 'fas fa-lightbulb', style: { color: '#6366f1' } }),
                React.createElement('span', { 
                    className: 'text-sm text-slate-700 font-medium'
                }, 'Highlighted columns mark the previous two calendar months (scroll snaps to the first)')
            ),
            // Field type legend
            React.createElement('div', { className: 'flex items-center gap-4 flex-wrap' },
                React.createElement('div', { className: 'flex items-center gap-1.5' },
                    React.createElement('div', { style: { width: '12px', height: '12px', borderRadius: '4px', backgroundColor: '#0ea5e9' } }),
                    React.createElement('span', { className: 'text-xs text-slate-600' }, 'Doc collection')
                ),
                React.createElement('div', { className: 'flex items-center gap-1.5' },
                    React.createElement('div', { style: { width: '12px', height: '12px', borderRadius: '4px', backgroundColor: '#6366f1' } }),
                    React.createElement('span', { className: 'text-xs text-slate-600' }, 'Compliance')
                ),
                React.createElement('div', { className: 'flex items-center gap-1.5' },
                    React.createElement('div', { style: { width: '12px', height: '12px', borderRadius: '4px', backgroundColor: '#14b8a6' } }),
                    React.createElement('span', { className: 'text-xs text-slate-600' }, 'Data')
                ),
                React.createElement('div', { className: 'flex items-center gap-1.5' },
                    React.createElement('div', { style: { width: '12px', height: '12px', borderRadius: '4px', backgroundColor: '#d97706' } }),
                    React.createElement('span', { className: 'text-xs text-slate-600' }, 'Comments')
                )
            )
        ),
        // Modern Table Container with Enhanced Styling
        React.createElement('div', { 
            ref: tableRef, 
            className: 'overflow-x-auto bg-white rounded-xl border border-slate-200/90',
            style: { 
                boxShadow: '0 10px 40px -12px rgba(30, 41, 59, 0.12), 0 4px 14px -6px rgba(15, 23, 42, 0.06)'
            }
        },
            React.createElement('table', { 
                className: 'text-left border-collapse w-full',
                style: { borderSpacing: 0, tableLayout: 'auto' }
            },
                React.createElement('thead', { 
                    className: 'bg-slate-50',
                    style: { 
                        borderBottom: '2px solid #e2e8f0',
                        position: 'sticky',
                        top: 0,
                        zIndex: 20
                    }
                },
                    // First row: Month headers - Modern Design
                    React.createElement('tr', null,
                        React.createElement('th', { 
                            rowSpan: 2,
                            style: {
                                padding: '14px 18px',
                                fontSize: '12px',
                                fontWeight: '700',
                                background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
                                color: '#f8fafc',
                                border: 'none',
                                borderRight: '2px solid #334155',
                                position: 'sticky',
                                left: 0,
                                zIndex: 15,
                                minWidth: `${TRACK_STICKY_PROJECT_WIDTH}px`,
                                width: `${TRACK_STICKY_PROJECT_WIDTH}px`,
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em'
                            },
                            className: 'text-left sticky left-0'
                        }, 
                            React.createElement('div', { className: 'flex items-center gap-2' },
                                React.createElement('i', { className: 'fas fa-project-diagram text-sm text-indigo-300' }),
                                React.createElement('span', null, 'Project')
                            )
                        ),
                        (Array.isArray(months) ? months : []).map((month, idx) => {
                            const safeMonth = String(month || '');
                            const isWorking = isWorkingMonthForYear(idx, safeYear);
                            return React.createElement('th', {
                                key: safeMonth + '-header',
                                colSpan: 4,
                                style: {
                                    padding: '14px 16px',
                                    fontSize: '12px',
                                    fontWeight: '700',
                                    textAlign: 'center',
                                    backgroundColor: isWorking ? '#dbeafe' : '#f8fafc',
                                    backgroundImage: 'none',
                                    color: isWorking ? '#1e3a8a' : '#334155',
                                    border: 'none',
                                    borderLeft: idx === 0 ? '2px solid #475569' : TRACK_MONTH_SEPARATOR_BORDER,
                                    borderBottom: isWorking ? '3px solid #2563eb' : '2px solid #e5e7eb',
                                    minWidth: `${TRACK_MONTH_GROUP_WIDTH}px`,
                                    width: `${TRACK_MONTH_GROUP_WIDTH}px`,
                                    maxWidth: `${TRACK_MONTH_GROUP_WIDTH}px`,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    position: 'relative'
                                },
                                'data-month-header': safeMonth
                            }, 
                                isWorking ? React.createElement('div', { className: 'flex items-center justify-center gap-2 flex-wrap' },
                                    React.createElement('i', { className: 'fas fa-star text-xs', style: { color: '#2563eb' } }),
                                    React.createElement('span', null, safeMonth.slice(0, 3) + " '" + String(safeYear).slice(-2)),
                                    React.createElement('span', { 
                                        className: 'ml-1 px-2 py-0.5 rounded-md text-[10px] font-bold',
                                        style: { backgroundColor: '#ffffff', color: '#1d4ed8', border: '1px solid #93c5fd' }
                                    }, 'WORKING')
                                ) : safeMonth.slice(0, 3) + " '" + String(safeYear).slice(-2)
                            );
                        }),
                        React.createElement('th', { 
                            rowSpan: 2,
                            style: {
                                padding: '14px 16px',
                                fontSize: '12px',
                                fontWeight: '700',
                                background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
                                color: '#f8fafc',
                                border: 'none',
                                borderLeft: '2px solid #334155',
                                minWidth: '132px',
                                width: '132px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em'
                            }
                        }, 
                            React.createElement('div', { className: 'flex items-center gap-2' },
                                React.createElement('i', { className: 'fas fa-user-tie text-sm text-sky-300' }),
                                React.createElement('span', null, 'PM')
                            )
                        ),
                        React.createElement('th', { 
                            rowSpan: 2,
                            style: {
                                padding: '14px 16px',
                                fontSize: '12px',
                                fontWeight: '700',
                                background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
                                color: '#f8fafc',
                                border: 'none',
                                minWidth: '152px',
                                width: '152px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em'
                            }
                        }, 
                            React.createElement('div', { className: 'flex items-center gap-2' },
                                React.createElement('i', { className: 'fas fa-tag text-sm text-violet-300' }),
                                React.createElement('span', null, 'Type')
                            )
                        ),
                        React.createElement('th', { 
                            rowSpan: 2,
                            style: {
                                padding: '14px 16px',
                                fontSize: '12px',
                                fontWeight: '700',
                                background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
                                color: '#f8fafc',
                                border: 'none',
                                minWidth: '132px',
                                width: '132px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em'
                            }
                        }, 
                            React.createElement('div', { className: 'flex items-center gap-2' },
                                React.createElement('i', { className: 'fas fa-circle-check text-sm text-emerald-300' }),
                                React.createElement('span', null, 'Status')
                            )
                        )
                    ),
                    // Second row: Sub-headers (Compliance, Data, Comments) - Modern Design with field-specific colors
                    React.createElement('tr', null,
                        (Array.isArray(months) ? months : []).map((month, idx) => {
                            const safeMonth = String(month || '');
                            const isWorking = isWorkingMonthForYear(idx, safeYear);
                            const monthLen = months.length;
                            const isLastMonthCol = idx >= monthLen - 1;
                            return React.createElement(React.Fragment, { key: safeMonth + '-subheaders' },
                                React.createElement('th', { 
                                    style: {
                                        padding: '10px 12px',
                                        fontSize: '11px',
                                        fontWeight: '600',
                                        textAlign: 'left',
                                        backgroundColor: isWorking ? '#e0f2fe' : '#fafafa',
                                        color: '#0c4a6e',
                                        border: 'none',
                                        borderLeft: idx === 0 ? '2px solid #475569' : '1px solid #e5e7eb',
                                        borderBottom: '1px solid #e5e7eb',
                                        borderRight: '1px solid #e5e7eb',
                                        minWidth: `${TRACK_CELL_WIDTH}px`,
                                        width: `${TRACK_CELL_WIDTH}px`,
                                        maxWidth: `${TRACK_CELL_WIDTH}px`,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.03em'
                                    }
                                }, 
                                    React.createElement('div', { className: 'flex items-center gap-1.5' },
                                        React.createElement('i', { className: 'fas fa-clipboard-list text-xs', style: { color: '#0284c7' } }),
                                        React.createElement('span', null, 'Monthly Doc Collection')
                                    )
                                ),
                                React.createElement('th', { 
                                    style: {
                                        padding: '10px 12px',
                                        fontSize: '11px',
                                        fontWeight: '600',
                                        textAlign: 'left',
                                        backgroundColor: isWorking ? '#e0e7ff' : '#fafafa',
                                        color: '#312e81',
                                        border: 'none',
                                        borderLeft: '1px solid #e5e7eb',
                                        borderBottom: '1px solid #e5e7eb',
                                        borderRight: '1px solid #e5e7eb',
                                        minWidth: `${TRACK_CELL_WIDTH}px`,
                                        width: `${TRACK_CELL_WIDTH}px`,
                                        maxWidth: `${TRACK_CELL_WIDTH}px`,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.03em'
                                    }
                                }, 
                                    React.createElement('div', { className: 'flex items-center gap-1.5' },
                                        React.createElement('i', { className: 'fas fa-shield-check text-xs', style: { color: '#4f46e5' } }),
                                        React.createElement('span', null, 'Compliance Review')
                                    )
                                ),
                                React.createElement('th', { 
                                    style: {
                                        padding: '10px 12px',
                                        fontSize: '11px',
                                        fontWeight: '600',
                                        textAlign: 'left',
                                        backgroundColor: isWorking ? '#ccfbf1' : '#fafafa',
                                        color: '#134e4a',
                                        border: 'none',
                                        borderBottom: '1px solid #e5e7eb',
                                        borderRight: '1px solid #e5e7eb',
                                        minWidth: `${TRACK_CELL_WIDTH}px`,
                                        width: `${TRACK_CELL_WIDTH}px`,
                                        maxWidth: `${TRACK_CELL_WIDTH}px`,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.03em'
                                    }
                                }, 
                                    React.createElement('div', { className: 'flex items-center gap-1.5' },
                                        React.createElement('i', { className: 'fas fa-database text-xs', style: { color: '#0d9488' } }),
                                        React.createElement('span', null, 'Monthly Data Review')
                                    )
                                ),
                                React.createElement('th', {
                                    style: {
                                        padding: '10px 12px',
                                        fontSize: '11px',
                                        fontWeight: '600',
                                        textAlign: 'left',
                                        backgroundColor: isWorking ? '#fef3c7' : '#fafafa',
                                        color: '#78350f',
                                        border: 'none',
                                        borderBottom: '1px solid #e5e7eb',
                                        borderRight: isLastMonthCol ? '1px solid #e5e7eb' : TRACK_MONTH_SEPARATOR_BORDER,
                                        minWidth: `${TRACK_CELL_WIDTH}px`,
                                        width: `${TRACK_CELL_WIDTH}px`,
                                        maxWidth: `${TRACK_CELL_WIDTH}px`,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.03em'
                                    }
                                }, 
                                    React.createElement('div', { className: 'flex items-center gap-1.5' },
                                        React.createElement('i', { className: 'fas fa-comment-dots text-xs', style: { color: '#d97706' } }),
                                        React.createElement('span', null, 'Comments')
                                    )
                                )
                            );
                        })
                    )
                ),
                React.createElement('tbody', null,
                    safeProjects.length === 0 ? React.createElement('tr', null,
                        React.createElement('td', { 
                            colSpan: months.length * 4 + 4, 
                            className: 'px-8 py-16 text-center',
                            style: { 
                                backgroundColor: '#f8fafc',
                                border: 'none'
                            }
                        }, 
                            loadError 
                                ? React.createElement('div', { 
                                    className: 'flex flex-col items-center gap-4 max-w-md mx-auto',
                                    style: { padding: '24px' }
                                },
                                    React.createElement('div', {
                                        className: 'w-16 h-16 rounded-full bg-red-100 flex items-center justify-center',
                                        style: { backgroundColor: '#fee2e2' }
                                    },
                                        React.createElement('i', { className: 'fas fa-exclamation-triangle text-red-600 text-2xl' })
                                    ),
                                    React.createElement('div', { className: 'space-y-2' },
                                        React.createElement('h3', { className: 'text-lg font-semibold text-gray-900' }, 'Error loading projects'),
                                        React.createElement('p', { className: 'text-sm text-gray-600' }, String(loadError))
                                    ),
                                    React.createElement('button', {
                                        onClick: () => window.location.reload(),
                                        className: 'px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm'
                                    }, 'Reload Page')
                                )
                                : projects.length === 0
                                    ? React.createElement('div', { 
                                        className: 'flex flex-col items-center gap-4 max-w-md mx-auto',
                                        style: { padding: '24px' }
                                    },
                                        React.createElement('div', {
                                            className: 'w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center',
                                            style: { backgroundColor: '#dbeafe' }
                                        },
                                            React.createElement('i', { className: 'fas fa-filter text-blue-600 text-2xl' })
                                        ),
                                        React.createElement('div', { className: 'space-y-2 text-center' },
                                            React.createElement('h3', { className: 'text-lg font-semibold text-gray-900' }, 'No projects found'),
                                            React.createElement('p', { className: 'text-sm text-gray-600' }, 'Projects need monthly progress data or MONTHLY type to appear here')
                                        )
                                    )
                                    : React.createElement('div', { 
                                        className: 'flex flex-col items-center gap-4 max-w-md mx-auto',
                                        style: { padding: '24px' }
                                    },
                                        React.createElement('div', {
                                            className: 'w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center',
                                            style: { backgroundColor: '#f3f4f6' }
                                        },
                                            React.createElement('i', { className: 'fas fa-info-circle text-gray-500 text-2xl' })
                                        ),
                                        React.createElement('div', { className: 'space-y-2 text-center' },
                                            React.createElement('h3', { className: 'text-lg font-semibold text-gray-900' }, 'No valid projects to display'),
                                            React.createElement('p', { className: 'text-sm text-gray-600' }, 'Projects may be missing required fields')
                                        )
                                    )
                        )
                    ) : (Array.isArray(safeProjects) && safeProjects.length > 0 ? safeProjects.map((project, rowIndex) => {
                        // Double-check project is valid before rendering
                        if (!project || !project.id) {
                            console.warn('⚠️ ProjectProgressTracker: Invalid project in map:', project);
                            return null;
                        }
                        
                        // Modern row styling with subtle gradients
                        const isEvenRow = rowIndex % 2 === 0;
                        const rowBgColor = isEvenRow ? '#ffffff' : '#f8fafc';
                        const isRowFocused = focusedRowId === project.id;
                        const rowBaseBgColor = isRowFocused ? '#eff6ff' : rowBgColor;
                        
                        // Build all cells for this row
                        const monthCells = (Array.isArray(months) ? months : []).reduce((acc, month) => {
                            const safeMonth = String(month || '');
                            acc.push(
                                renderProgressCell(project, safeMonth, 'docCollection', rowBaseBgColor, `${project.id}-${safeMonth}-docCollection`),
                                renderProgressCell(project, safeMonth, 'compliance', rowBaseBgColor, `${project.id}-${safeMonth}-compliance`),
                                renderProgressCell(project, safeMonth, 'data', rowBaseBgColor, `${project.id}-${safeMonth}-data`),
                                renderProgressCell(project, safeMonth, 'comments', rowBaseBgColor, `${project.id}-${safeMonth}-comments`)
                            );
                            return acc;
                        }, []);
                        
                        // Build all children for the row - flatten monthCells to ensure no nested arrays
                        const rowChildren = [
                            React.createElement('td', { 
                                style: {
                                    padding: '12px 16px',
                                    fontSize: '13px',
                                    backgroundColor: rowBaseBgColor,
                                    border: 'none',
                                    borderRight: '2px solid #475569',
                                    position: 'sticky',
                                    left: 0,
                                    zIndex: 9,
                                    minWidth: `${TRACK_STICKY_PROJECT_WIDTH}px`,
                                    width: `${TRACK_STICKY_PROJECT_WIDTH}px`,
                                    transition: 'background-color 0.2s ease',
                                    boxShadow: '4px 0 12px -6px rgba(15, 23, 42, 0.12)'
                                },
                                className: 'sticky left-0',
                                'data-project-id': project.id
                            },
                                React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
                                    React.createElement('span', { 
                                        style: { 
                                            fontWeight: '700', 
                                            color: '#111827', 
                                            fontSize: '14px',
                                            lineHeight: '1.5',
                                            letterSpacing: '-0.01em'
                                        } 
                                    }, String(project.name || 'Unnamed Project')),
                                    project.type && project.type !== '-' && project.type.trim() ? React.createElement('span', { 
                                        style: { 
                                            color: '#6b7280', 
                                            fontSize: '11px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            padding: '2px 8px',
                                            backgroundColor: '#f3f4f6',
                                            borderRadius: '4px',
                                            width: 'fit-content'
                                        } 
                                    },
                                        React.createElement('i', { className: 'fas fa-tag text-[9px]' }),
                                        String(project.type)
                                    ) : null,
                                    React.createElement('span', { 
                                        style: { 
                                            color: '#6b7280', 
                                            fontSize: '12px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            marginTop: '2px'
                                        } 
                                    },
                                        React.createElement('i', { className: 'fas fa-building text-[10px] text-gray-400' }),
                                        String(project.client || 'No Client')
                                    )
                                )
                            ),
                            ...monthCells,
                            React.createElement('td', { 
                                style: {
                                    padding: '12px 14px',
                                    fontSize: '12px',
                                    border: 'none',
                                    borderLeft: '2px solid #cbd5e1',
                                    backgroundColor: rowBaseBgColor,
                                    color: '#334155',
                                    minWidth: '132px',
                                    width: '132px',
                                    fontWeight: '500'
                                }
                            }, 
                                project.manager && project.manager !== '-' ? React.createElement('div', { className: 'flex items-center gap-2' },
                                    React.createElement('div', {
                                        className: 'w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center',
                                        style: { backgroundColor: '#dbeafe' }
                                    },
                                        React.createElement('i', { className: 'fas fa-user text-blue-600 text-xs' })
                                    ),
                                    React.createElement('span', null, String(project.manager))
                                ) : React.createElement('span', { className: 'text-gray-400' }, '-')
                            ),
                            React.createElement('td', { 
                                style: {
                                    padding: '12px 14px',
                                    fontSize: '12px',
                                    border: 'none',
                                    backgroundColor: rowBaseBgColor,
                                    color: '#334155',
                                    minWidth: '152px',
                                    width: '152px',
                                    fontWeight: '500'
                                }
                            }, 
                                project.type && project.type !== '-' ? React.createElement('span', {
                                    className: 'px-2.5 py-1 bg-primary-100 text-primary-700 rounded-md text-xs font-semibold',
                                    style: { display: 'inline-block' }
                                }, String(project.type)) : React.createElement('span', { className: 'text-gray-400' }, '-')
                            ),
                            React.createElement('td', { 
                                style: {
                                    padding: '12px 14px',
                                    border: 'none',
                                    backgroundColor: rowBaseBgColor,
                                    minWidth: '132px',
                                    width: '132px'
                                }
                            },
                                React.createElement('span', {
                                    className: 'px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5',
                                    style: { 
                                        display: 'inline-flex',
                                        backgroundColor: '#d1fae5',
                                        color: '#065f46'
                                    }
                                },
                                    React.createElement('i', { className: 'fas fa-circle-check text-[8px]' }),
                                    String(project.status || 'Active')
                                )
                            )
                        ];
                        
                        // Use React.createElement with all children as separate arguments
                        const rowStyle = {
                            borderBottom: '1px solid #e5e7eb',
                            backgroundColor: rowBaseBgColor,
                            transition: 'all 0.2s ease',
                            boxShadow: isRowFocused ? 'inset 0 0 0 2px rgba(37, 99, 235, 0.2)' : 'none'
                        };

                        return React.createElement('tr', { 
                            key: String(project.id),
                            'data-project-row': project.id,
                            style: rowStyle,
                            onMouseEnter: (e) => {
                                if (!isRowFocused) {
                                    e.currentTarget.style.backgroundColor = '#f1f5f9';
                                    e.currentTarget.style.boxShadow = 'inset 0 0 0 1px rgba(59, 130, 246, 0.1)';
                                }
                            },
                            onMouseLeave: (e) => {
                                e.currentTarget.style.backgroundColor = rowBaseBgColor;
                                e.currentTarget.style.boxShadow = isRowFocused ? 'inset 0 0 0 2px rgba(37, 99, 235, 0.2)' : 'none';
                            }
                        }, ...rowChildren);
                    }).filter(item => item !== null) : []
                    )
                )
            )
        )
    );
};

// Memoize component to prevent unnecessary re-renders
let ProjectProgressTrackerMemo;
try {
    if (typeof memo === 'function' && memo !== null && memo !== undefined) {
        ProjectProgressTrackerMemo = memo(ProjectProgressTracker);
    } else {
        ProjectProgressTrackerMemo = ProjectProgressTracker;
    }
} catch (memoError) {
    console.warn('⚠️ ProjectProgressTracker: Failed to memoize, using component directly:', memoError);
    ProjectProgressTrackerMemo = ProjectProgressTracker;
}

// Register globally - ensure React is available first
const registerComponent = () => {
    try {
        if (typeof window === 'undefined') {
            console.error('❌ ProjectProgressTracker: window is not available');
            return;
        }

        // Ensure React is available before registering
        if (typeof window.React === 'undefined') {
            console.warn('⚠️ ProjectProgressTracker: React not available yet, deferring registration...');
            // Retry after a short delay
            setTimeout(registerComponent, 100);
            return;
        }

        // Register the component
        window.ProjectProgressTracker = ProjectProgressTrackerMemo;
        console.log('✅ ProjectProgressTracker: Component registered successfully');
        
        // Dispatch componentLoaded event so other components know it's available
        try {
            const event = new CustomEvent('componentLoaded', { 
                detail: { component: 'ProjectProgressTracker' } 
            });
            window.dispatchEvent(event);
            console.log('✅ ProjectProgressTracker: componentLoaded event dispatched');
        } catch (eventError) {
            console.warn('⚠️ ProjectProgressTracker: Failed to dispatch componentLoaded event:', eventError);
        }
    } catch (error) {
        console.error('❌ Failed to register ProjectProgressTracker:', error);
        console.error('❌ Error stack:', error?.stack);
        // Fallback: register a simple error component
        if (typeof window !== 'undefined' && window.React && window.React.createElement) {
            window.ProjectProgressTracker = function() {
                try {
                    return window.React.createElement('div', { className: 'p-4 bg-red-50' },
                        window.React.createElement('p', { className: 'text-red-800' }, 
                            'Component registration failed: ' + (error?.message || 'Unknown error')
                        )
                    );
                } catch (e) {
                    console.error('❌ Failed to create error component:', e);
                    return null;
                }
            };
            console.log('⚠️ ProjectProgressTracker: Registered fallback error component');
        }
    }
};

// Register immediately if React is available, otherwise wait
if (typeof window !== 'undefined' && window.React) {
    registerComponent();
} else {
    // Wait for React to be available
    const checkReact = setInterval(() => {
        if (typeof window !== 'undefined' && window.React) {
            clearInterval(checkReact);
            registerComponent();
        }
    }, 50);
    
    // Timeout after 10 seconds
    setTimeout(() => {
        clearInterval(checkReact);
        if (typeof window !== 'undefined' && !window.ProjectProgressTracker) {
            console.error('❌ ProjectProgressTracker: React did not become available after 10 seconds');
            registerComponent(); // Try anyway
        }
    }, 10000);
}

                        }, ...rowChildren);
                    }).filter(item => item !== null) : []
                    )
                )
            )
        )
    );
};

// Memoize component to prevent unnecessary re-renders
let ProjectProgressTrackerMemo;
try {
    if (typeof memo === 'function' && memo !== null && memo !== undefined) {
        ProjectProgressTrackerMemo = memo(ProjectProgressTracker);
    } else {
        ProjectProgressTrackerMemo = ProjectProgressTracker;
    }
} catch (memoError) {
    console.warn('⚠️ ProjectProgressTracker: Failed to memoize, using component directly:', memoError);
    ProjectProgressTrackerMemo = ProjectProgressTracker;
}

// Register globally - ensure React is available first
const registerComponent = () => {
    try {
        if (typeof window === 'undefined') {
            console.error('❌ ProjectProgressTracker: window is not available');
            return;
        }

        // Ensure React is available before registering
        if (typeof window.React === 'undefined') {
            console.warn('⚠️ ProjectProgressTracker: React not available yet, deferring registration...');
            // Retry after a short delay
            setTimeout(registerComponent, 100);
            return;
        }

        // Register the component
        window.ProjectProgressTracker = ProjectProgressTrackerMemo;
        console.log('✅ ProjectProgressTracker: Component registered successfully');
        
        // Dispatch componentLoaded event so other components know it's available
        try {
            const event = new CustomEvent('componentLoaded', { 
                detail: { component: 'ProjectProgressTracker' } 
            });
            window.dispatchEvent(event);
            console.log('✅ ProjectProgressTracker: componentLoaded event dispatched');
        } catch (eventError) {
            console.warn('⚠️ ProjectProgressTracker: Failed to dispatch componentLoaded event:', eventError);
        }
    } catch (error) {
        console.error('❌ Failed to register ProjectProgressTracker:', error);
        console.error('❌ Error stack:', error?.stack);
        // Fallback: register a simple error component
        if (typeof window !== 'undefined' && window.React && window.React.createElement) {
            window.ProjectProgressTracker = function() {
                try {
                    return window.React.createElement('div', { className: 'p-4 bg-red-50' },
                        window.React.createElement('p', { className: 'text-red-800' }, 
                            'Component registration failed: ' + (error?.message || 'Unknown error')
                        )
                    );
                } catch (e) {
                    console.error('❌ Failed to create error component:', e);
                    return null;
                }
            };
            console.log('⚠️ ProjectProgressTracker: Registered fallback error component');
        }
    }
};

// Register immediately if React is available, otherwise wait
if (typeof window !== 'undefined' && window.React) {
    registerComponent();
} else {
    // Wait for React to be available
    const checkReact = setInterval(() => {
        if (typeof window !== 'undefined' && window.React) {
            clearInterval(checkReact);
            registerComponent();
        }
    }, 50);
    
    // Timeout after 10 seconds
    setTimeout(() => {
        clearInterval(checkReact);
        if (typeof window !== 'undefined' && !window.ProjectProgressTracker) {
            console.error('❌ ProjectProgressTracker: React did not become available after 10 seconds');
            registerComponent(); // Try anyway
        }
    }, 10000);
}
