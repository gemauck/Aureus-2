// Get dependencies from window
const { useState, useEffect, useMemo, useCallback, useRef } = React;

const ADMIN_ROLES = ['admin', 'administrator', 'superadmin', 'super-admin', 'super_admin', 'system_admin'];
const ADMIN_PERMISSION_KEYS = ['admin', 'administrator', 'superadmin', 'super-admin', 'super_admin', 'system_admin'];

const normalizePermissions = (permissions) => {
    if (!permissions) return [];
    if (Array.isArray(permissions)) return permissions;
    if (typeof permissions === 'string') {
        try {
            const parsed = JSON.parse(permissions);
            if (Array.isArray(parsed)) {
                return parsed;
            }
        } catch (error) {
            return permissions
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean);
        }
    }
    return [];
};

const isAdminFromUser = (user) => {
    if (!user) return false;

    const role = (user.role || '').toString().trim().toLowerCase();
    if (ADMIN_ROLES.includes(role)) {
        return true;
    }

    const normalizedPermissions = normalizePermissions(user.permissions).map((perm) =>
        (perm || '').toString().trim().toLowerCase()
    );

    return normalizedPermissions.some((perm) => ADMIN_PERMISSION_KEYS.includes(perm));
};

// Department definitions - matching API and Teams configuration
const DEPARTMENTS = [
    { id: 'management', name: 'Management', icon: 'fa-user-tie', color: 'blue' },
    { id: 'compliance', name: 'Compliance', icon: 'fa-shield-alt', color: 'red' },
    { id: 'finance', name: 'Finance', icon: 'fa-coins', color: 'yellow' },
    { id: 'technical', name: 'Technical', icon: 'fa-tools', color: 'purple' },
    { id: 'data', name: 'Data & Analytics', icon: 'fa-chart-line', color: 'indigo' },
    { id: 'support', name: 'Support', icon: 'fa-headset', color: 'green' },
    { id: 'commercial', name: 'Commercial', icon: 'fa-handshake', color: 'orange' },
    { id: 'business-development', name: 'Business Development', icon: 'fa-rocket', color: 'pink' }
];

const padTwo = (value) => String(value).padStart(2, '0');

const isValidDate = (date) => date instanceof Date && !Number.isNaN(date.getTime());

const parseDateInput = (value) => {
    if (!value && value !== 0) return null;
    if (value instanceof Date) {
        return isValidDate(value) ? new Date(value.getTime()) : null;
    }

    const trimmed = String(value).trim();
    if (!trimmed) return null;

    const sanitized = trimmed.replace(/\//g, '-');
    const isoMatch = sanitized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
        const [, year, month, day] = isoMatch;
        const parsed = new Date(Number(year), Number(month) - 1, Number(day));
        return isValidDate(parsed) ? parsed : null;
    }

    const parsed = new Date(trimmed);
    return isValidDate(parsed) ? parsed : null;
};

const getMonthKeyFromDate = (date) => {
    if (!isValidDate(date)) return null;
    return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}`;
};

// Helper function to decode HTML entities and ensure proper HTML rendering
const decodeHtmlContent = (html) => {
    if (!html || typeof html !== 'string') return html || '';
    
    // If the content contains escaped HTML entities, decode them
    // Check if content has escaped HTML tags (like &lt;div&gt; instead of <div>)
    if (html.includes('&lt;') || html.includes('&gt;') || html.includes('&amp;') || html.includes('&quot;') || html.includes('&#39;')) {
        // Create a temporary element to decode HTML entities
        const textarea = document.createElement('textarea');
        textarea.innerHTML = html;
        let decoded = textarea.value;
        
        // If still contains escaped entities, decode again (handles double-encoding)
        if (decoded.includes('&lt;') || decoded.includes('&gt;') || decoded.includes('&amp;')) {
            textarea.innerHTML = decoded;
            decoded = textarea.value;
        }
        
        return decoded;
    }
    
    // If no escaped entities found, return as-is (already valid HTML)
    return html;
};

const normalizeMonthKeyInput = (value) => {
    if (!value && value !== 0) return null;
    if (value instanceof Date) {
        return getMonthKeyFromDate(value);
    }

    const trimmed = String(value).trim();
    if (!trimmed) return null;

    const sanitized = trimmed.replace(/\//g, '-');
    const hyphenMatch = sanitized.match(/^(\d{4})-(\d{1,2})$/);
    if (hyphenMatch) {
        const [, year, month] = hyphenMatch;
        const monthNumber = Number(month);
        if (monthNumber >= 1 && monthNumber <= 12) {
            return `${year}-${padTwo(monthNumber)}`;
        }
    }

    const compactMatch = sanitized.match(/^(\d{4})(\d{2})$/);
    if (compactMatch) {
        const [, year, month] = compactMatch;
        const monthNumber = Number(month);
        if (monthNumber >= 1 && monthNumber <= 12) {
            return `${year}-${padTwo(monthNumber)}`;
        }
    }

    const parsed = parseDateInput(trimmed);
    return parsed ? getMonthKeyFromDate(parsed) : null;
};

const deriveWeekDetails = (value) => {
    const baseDate = value ? parseDateInput(value) : null;
    if (!baseDate) return null;

    const weekStart = new Date(baseDate);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const weekKey = `${weekStart.getFullYear()}-${padTwo(weekStart.getMonth() + 1)}-${padTwo(weekStart.getDate())}`;
    // IMPORTANT:
    // Use the ORIGINAL selected/base date to determine the "month" this week belongs to,
    // not the derived weekStart Sunday. This ensures that when a user selects a date like
    // 1 December, the week is grouped under December (the selected month) instead of
    // November (because the Sunday weekStart might still be in November).
    const monthKey = getMonthKeyFromDate(baseDate);

    return { weekStart, weekEnd, weekKey, monthKey };
};

const ManagementMeetingNotes = () => {
    // Get theme state
    let themeResult = { isDark: false };
    try {
        if (window.useTheme && typeof window.useTheme === 'function') {
            themeResult = window.useTheme();
        }
    } catch (error) {
        try {
            const storedTheme = localStorage.getItem('abcotronics_theme');
            themeResult.isDark = storedTheme === 'dark';
        } catch (e) {
            themeResult.isDark = false;
        }
    }
    const isDark = themeResult?.isDark || false;

    const authHook = window.useAuth || (() => ({ user: null }));
    const { user: currentUser } = authHook();
    const isAdminUser = useMemo(() => isAdminFromUser(currentUser), [currentUser]);

    useEffect(() => {
        if (!isAdminUser) {
            console.warn('ManagementMeetingNotes: blocked access for non-admin user', {
                userId: currentUser?.id,
                email: currentUser?.email,
                role: currentUser?.role
            });
        }
    }, [isAdminUser, currentUser]);

    const [monthlyNotesList, setMonthlyNotesList] = useState([]);
    const [currentMonthlyNotes, setCurrentMonthlyNotes] = useState(null);
    
    // Initialize selectedMonth and selectedWeek from URL or default
    const getMonthFromURL = () => {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('month') || null;
    };
    
    const getWeekFromURL = () => {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('week') || null;
    };
    
    const [selectedMonth, setSelectedMonth] = useState(getMonthFromURL());
    const [selectedWeek, setSelectedWeek] = useState(getWeekFromURL());
    const [selectedDepartment, setSelectedDepartment] = useState(null);
    
    // Update URL when month or week changes
    useEffect(() => {
        const url = new URL(window.location);
        if (selectedMonth) {
            url.searchParams.set('month', selectedMonth);
        } else {
            url.searchParams.delete('month');
        }
        if (selectedWeek) {
            url.searchParams.set('week', selectedWeek);
        } else {
            url.searchParams.delete('week');
        }
        // Keep other params
        if (url.searchParams.get('tab') !== 'meeting-notes') {
            url.searchParams.set('tab', 'meeting-notes');
        }
        if (url.searchParams.get('team') !== 'management') {
            url.searchParams.set('team', 'management');
        }
        window.history.pushState({ month: selectedMonth, week: selectedWeek, tab: 'meeting-notes' }, '', url);
    }, [selectedMonth, selectedWeek]);
    
    // Listen for browser back/forward
    useEffect(() => {
        const handlePopState = (event) => {
            if (event.state) {
                if (event.state.month) {
                    setSelectedMonth(event.state.month);
                }
                if (event.state.week) {
                    setSelectedWeek(event.state.week);
                }
            } else {
                // Read from URL
                const monthFromURL = getMonthFromURL();
                const weekFromURL = getWeekFromURL();
                if (monthFromURL) setSelectedMonth(monthFromURL);
                if (weekFromURL) setSelectedWeek(weekFromURL);
            }
        };
        
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);
    const [users, setUsers] = useState([]);
    const [isReady, setIsReady] = useState(false);
    const [loading, setLoading] = useState(false);
    const [newMonthKey, setNewMonthKey] = useState('');
    const [newWeekStartInput, setNewWeekStartInput] = useState('');
    // Modal states
    const [showAllocationModal, setShowAllocationModal] = useState(false);
    const [showActionItemModal, setShowActionItemModal] = useState(false);
    const [showCommentModal, setShowCommentModal] = useState(false);
    const [editingActionItem, setEditingActionItem] = useState(null);
    const [commentContext, setCommentContext] = useState(null); // {type: 'monthly'|'department'|'action', id: string}
    
    // State for tracking editing status and temporary values for each field
    const [editingFields, setEditingFields] = useState({}); // { [departmentNotesId-field]: true/false }
    const [tempFieldValues, setTempFieldValues] = useState({}); // { [departmentNotesId-field]: value }
    
    // State for showing save status indicator
    const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved'
    
    // State for blocking navigation when saves are in progress
    const [isBlockingNavigation, setIsBlockingNavigation] = useState(false);

    // Track pending saves to ensure they complete before navigation
    const pendingSaves = useRef(new Set());
    
    // Debounce timers for auto-save
    const saveTimers = useRef({});
    // Latest values waiting to be saved (for flush on blur)
    const pendingValues = useRef({});
    
    // Track current React state values for all fields (fallback if DOM capture fails)
    const currentFieldValues = useRef({}); // { [fieldKey]: value }

    const weekCardRefs = useRef({});
    
    const reloadMonthlyNotes = useCallback(async (preferredMonthKey = null) => {
        try {
            const response = await window.DatabaseAPI.getMeetingNotes();
            const notes =
                response?.data?.monthlyNotes ||
                response?.monthlyNotes ||
                [];

            setMonthlyNotesList(notes);

            if (!notes.length) {
                setSelectedMonth(null);
                setCurrentMonthlyNotes(null);
                setSelectedWeek(null);
                return;
            }

            const nextMonthKey =
                preferredMonthKey && notes.some((note) => note?.monthKey === preferredMonthKey)
                    ? preferredMonthKey
                    : notes[0].monthKey;

            setSelectedMonth(nextMonthKey);
            const nextMonth = notes.find((note) => note?.monthKey === nextMonthKey) || null;
            setCurrentMonthlyNotes(nextMonth);
            setSelectedWeek(null);
        } catch (error) {
            console.error('Error reloading monthly notes:', error);
            if (typeof alert === 'function') {
                alert('Failed to refresh monthly meeting notes.');
            }
        }
    }, []);

    const updateDepartmentNotesLocal = useCallback(
        (departmentNotesId, field, value, monthlyId) => {
            const applyUpdate = (note) => {
                if (!note) {
                    return note;
                }

                const weeklyNotes = Array.isArray(note.weeklyNotes)
                    ? note.weeklyNotes.map((week) => ({
                          ...week,
                          departmentNotes: Array.isArray(week.departmentNotes)
                              ? week.departmentNotes.map((deptNote) =>
                                    deptNote?.id === departmentNotesId ? { ...deptNote, [field]: value } : deptNote
                                )
                              : week.departmentNotes
                      }))
                    : note.weeklyNotes;
                return { ...note, weeklyNotes };
            };

            setCurrentMonthlyNotes((prev) => (prev ? applyUpdate(prev) : prev));

            if (monthlyId) {
                setMonthlyNotesList((prev) => {
                    if (!Array.isArray(prev)) {
                        return prev;
                    }
                    return prev.map((note) => (note?.id === monthlyId ? applyUpdate(note) : note));
                });
            }
        },
        []
    );

    // Initialize selected month:
    // - Respect an explicit month in the URL (for shared links / navigation)
    // - Otherwise, default to the current calendar month
    useEffect(() => {
        try {
            const monthFromURL = getMonthFromURL();
            
            if (monthFromURL) {
                const normalizedFromURL = normalizeMonthKeyInput(monthFromURL);
                if (normalizedFromURL) {
                    setSelectedMonth(normalizedFromURL);
                    return;
                }
            }
            
            // No (valid) month in URL - use the current month
            const now = new Date();
            const monthKey = getMonthKeyFromDate(now);
            if (monthKey) {
                setSelectedMonth(monthKey);
            }
        } catch (error) {
            console.warn('ManagementMeetingNotes: failed to initialize month, falling back to current month', error);
            const now = new Date();
            const monthKey = getMonthKeyFromDate(now);
            if (monthKey) {
                setSelectedMonth(monthKey);
            }
        }
    }, []);

    // Load users
    useEffect(() => {
        if (!isAdminUser) {
            return;
        }

        const loadUsers = async () => {
            try {
                if (window.DatabaseAPI) {
                    const response = await window.DatabaseAPI.getUsers();
                    const usersList = response.data?.users || response.data?.data?.users || [];
                    setUsers(usersList);
                }
            } catch (error) {
                console.error('Error loading users:', error);
            }
        };
        loadUsers();
    }, [isAdminUser]);

    // Load meeting notes
    useEffect(() => {
        if (!isAdminUser) {
            setIsReady(true);
            setLoading(false);
            return;
        }

        const loadMeetingNotes = async () => {
            try {
                setLoading(true);
                if (!window.DatabaseAPI) {
                    console.error('DatabaseAPI not available');
                    setIsReady(true);
                    return;
                }
                
                const response = await window.DatabaseAPI.getMeetingNotes();
                const notes = response.data?.monthlyNotes || [];
                setMonthlyNotesList(notes);
                
                // Load current month's notes if selected
                if (selectedMonth) {
                    const currentNotes = notes.find(n => n.monthKey === selectedMonth);
                    if (currentNotes) {
                        setCurrentMonthlyNotes(currentNotes);
                    } else {
                        setCurrentMonthlyNotes(null);
                    }
                }
                
                setIsReady(true);
            } catch (error) {
                console.error('Error loading meeting notes:', error);
                setIsReady(true);
            } finally {
                setLoading(false);
            }
        };
        loadMeetingNotes();
    }, [isAdminUser]);

    // Load current month's notes when selected month changes
    useEffect(() => {
        if (!isAdminUser) {
            return;
        }

        const loadCurrentMonth = async () => {
            if (!selectedMonth || !window.DatabaseAPI) return;
            
            try {
                setLoading(true);
                const response = await window.DatabaseAPI.getMeetingNotes(selectedMonth);
                const notes = response.data?.monthlyNotes;
                setCurrentMonthlyNotes(notes || null);
            } catch (error) {
                console.error('Error loading current month notes:', error);
                setCurrentMonthlyNotes(null);
            } finally {
                setLoading(false);
            }
        };
        loadCurrentMonth();
    }, [selectedMonth, isAdminUser]);

    // Get available months
    const availableMonths = useMemo(() => {
        const months = monthlyNotesList.map(note => note.monthKey);
        return months.sort().reverse();
    }, [monthlyNotesList]);

    // Get weeks for selected month
    const weeks = useMemo(() => {
        if (!currentMonthlyNotes || !currentMonthlyNotes.weeklyNotes) return [];
        return [...currentMonthlyNotes.weeklyNotes].sort((a, b) => {
            return new Date(b.weekStart) - new Date(a.weekStart);
        });
    }, [currentMonthlyNotes]);

    const getWeekIdentifier = (week) => {
        if (!week) {
            return '';
        }
        return week.weekKey || week.id || '';
    };

    const scrollToWeekId = useCallback((weekId) => {
        if (!weekId) {
            return;
        }
        const refs = weekCardRefs.current || {};
        const node = refs[weekId];
        if (node && typeof node.scrollIntoView === 'function') {
            try {
                node.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                    inline: 'center'
                });
            } catch (error) {
                console.warn('ManagementMeetingNotes: Failed to scroll to week', weekId, error);
            }
        }
    }, []);

    const selectedWeekIndex = useMemo(() => {
        if (!Array.isArray(weeks) || weeks.length === 0) {
            return -1;
        }
        return weeks.findIndex((week, index) => {
            const identifier = getWeekIdentifier(week) || `week-${index}`;
            return identifier === selectedWeek;
        });
    }, [weeks, selectedWeek]);

    const resolvedSelectedWeekIndex = selectedWeekIndex >= 0 ? selectedWeekIndex : -1;

    // Calculate actual current week and next week based on today's date
    const currentWeekId = useMemo(() => {
        if (!Array.isArray(weeks) || weeks.length === 0) {
            return null;
        }
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const currentWeek = weeks.find((week) => {
            if (!week) return false;
            const start = week.weekStart ? new Date(week.weekStart) : null;
            if (!start || Number.isNaN(start.getTime())) return false;
            const end = week.weekEnd ? new Date(week.weekEnd) : new Date(start);
            if (Number.isNaN(end.getTime())) return false;
            
            const startOfDay = new Date(start);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(end);
            endOfDay.setHours(23, 59, 59, 999);
            
            return today >= startOfDay && today <= endOfDay;
        });
        
        if (!currentWeek) return null;
        const index = weeks.indexOf(currentWeek);
        const rawIdentifier = getWeekIdentifier(currentWeek);
        return rawIdentifier || (index >= 0 ? `week-${index}` : null);
    }, [weeks]);

    const nextWeekId = useMemo(() => {
        if (!currentWeekId || !Array.isArray(weeks) || weeks.length === 0) {
            return null;
        }
        const currentIndex = weeks.findIndex((week, index) => {
            const identifier = getWeekIdentifier(week) || `week-${index}`;
            return identifier === currentWeekId;
        });
        if (currentIndex < 0 || currentIndex >= weeks.length - 1) {
            return null;
        }
        const nextWeek = weeks[currentIndex + 1];
        if (!nextWeek) return null;
        const rawIdentifier = getWeekIdentifier(nextWeek);
        return rawIdentifier || `week-${currentIndex + 1}`;
    }, [weeks, currentWeekId]);

    useEffect(() => {
        if (!Array.isArray(weeks) || weeks.length === 0) {
            if (selectedWeek !== null) {
                setSelectedWeek(null);
            }
            return;
        }

        // Helper function to get week identifier
        const getWeekId = (week, index) => {
            if (!week) return null;
            if (week.weekKey) return week.weekKey;
            if (week.id) return week.id;
            return `week-${index}`;
        };

        // Check if selectedWeek from URL exists in weeks
        const weekFromURL = getWeekFromURL();
        if (weekFromURL) {
            const hasWeekFromURL = weeks.some((week, index) => {
                const identifier = getWeekId(week, index);
                return identifier === weekFromURL;
            });
            if (hasWeekFromURL && weekFromURL !== selectedWeek) {
                setSelectedWeek(weekFromURL);
                return;
            }
        }

        // If selectedWeek exists and is valid, keep it
        const hasSelectedWeek = weeks.some((week, index) => {
            const identifier = getWeekId(week, index);
            return identifier === selectedWeek;
        });
        if (hasSelectedWeek && selectedWeek) {
            return;
        }

        // Fallback to current week (based on actual date) or first week
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const matchedWeek =
            weeks.find((week) => {
                if (!week) {
                    return false;
                }
                const start = week.weekStart ? new Date(week.weekStart) : null;
                if (!start || Number.isNaN(start.getTime())) {
                    return false;
                }
                const end = week.weekEnd ? new Date(week.weekEnd) : new Date(start);
                if (Number.isNaN(end.getTime())) {
                    return false;
                }
                const startOfDay = new Date(start);
                startOfDay.setHours(0, 0, 0, 0);
                const endOfDay = new Date(end);
                endOfDay.setHours(23, 59, 59, 999);
                return today >= startOfDay && today <= endOfDay;
            }) || null;

        const fallbackWeek = matchedWeek || weeks[0];
        const fallbackIndex = weeks.indexOf(fallbackWeek);
        const fallbackId = getWeekId(fallbackWeek, fallbackIndex);
        if (fallbackId && fallbackId !== selectedWeek) {
            setSelectedWeek(fallbackId);
        }
    }, [weeks, selectedWeek]);

    useEffect(() => {
        if (!selectedWeek) {
            return;
        }
        scrollToWeekId(selectedWeek);
    }, [selectedWeek, weeks, scrollToWeekId]);

    // Track active save promises to wait for completion
    const activeSavePromises = useRef(new Set());
    
    // Expose flush function and pending status for parent components (initialized after flushPendingSaves is defined)
    const managementMeetingNotesRef = useRef({
        flushPendingSaves: null,
        hasPendingSaves: () => {
            return pendingSaves.current.size > 0 || 
                   Object.keys(pendingValues.current).length > 0 || 
                   activeSavePromises.current.size > 0;
        },
        isBlockingNavigation: () => isBlockingNavigation
    });
    
    // CRITICAL: Capture current values from DOM inputs before flushing
    // This ensures we get the absolute latest typed values even if onChange hasn't fired
    const captureCurrentFieldValues = useCallback(() => {
        const capturedValues = {};
        
        // Find all textarea elements with data attributes (our department note fields)
        const textareas = document.querySelectorAll('textarea[data-dept-note-id][data-field]');
        textareas.forEach(textarea => {
            const deptNoteId = textarea.getAttribute('data-dept-note-id');
            const fieldName = textarea.getAttribute('data-field');
            const value = textarea.value || '';
            
            if (deptNoteId && fieldName) {
                const fieldKey = `${deptNoteId}-${fieldName}`;
                // ALWAYS update with current DOM value - it's the source of truth
                capturedValues[fieldKey] = {
                    departmentNotesId: deptNoteId,
                    field: fieldName,
                    value: value
                };
                console.log(`📸 Captured textarea DOM value for ${fieldKey}:`, value.substring(0, 50) + '...');
            }
        });
        
        // CRITICAL: Find RichTextEditor contentEditable divs
        // Strategy: Find labels for our fields, then find the contentEditable div that follows
        const labels = document.querySelectorAll('label');
        labels.forEach(label => {
            const labelText = (label.textContent || '').toLowerCase();
            let fieldName = null;
            
            // Determine field name from label text
            if (labelText.includes('success')) {
                fieldName = 'successes';
            } else if ((labelText.includes('week') || labelText.includes('plan')) && (labelText.includes('follow') || labelText.includes('plan'))) {
                fieldName = 'weekToFollow';
            } else if (labelText.includes('frustrat')) {
                fieldName = 'frustrations';
            }
            
            if (fieldName) {
                // Find the contentEditable div that follows this label (RichTextEditor)
                let nextSibling = label.nextElementSibling;
                let contentEditableDiv = null;
                
                // Look for contentEditable in next sibling or its children
                while (nextSibling && !contentEditableDiv) {
                    contentEditableDiv = nextSibling.querySelector('[contenteditable="true"]') || 
                                       (nextSibling.getAttribute('contenteditable') === 'true' ? nextSibling : null);
                    if (contentEditableDiv) break;
                    nextSibling = nextSibling.nextElementSibling;
                }
                
                if (contentEditableDiv) {
                    // Find the department note ID by walking up the DOM tree
                    let parent = label.closest('[class*="department"], [class*="dept"], [class*="note"]') || label.parentElement;
                    let deptNoteId = null;
                    
                    // Walk up to find department note context - look for week cards or department note containers
                    while (parent && parent !== document.body) {
                        // Check if we're in a week card that contains department notes
                        // The department note ID should be in the currentMonthlyNotes data
                        // We'll need to match by department and week
                        const weekCard = parent.closest('[class*="week"], [data-week-id]');
                        if (weekCard) {
                            // Try to find deptNote by matching department and week from currentMonthlyNotes
                            // For now, we'll use a different strategy - find by matching the field value
                            // Actually, let's use the React state fallback for RichTextEditor
                            // and focus on textarea capture which has data attributes
                            break;
                        }
                        parent = parent.parentElement;
                    }
                    
                    // If we found contentEditable but no deptNoteId, we'll rely on React state fallback
                    // But try to extract from the DOM structure if possible
                    const html = contentEditableDiv.innerHTML || '';
                    if (html.trim()) {
                        // We'll match this later using React state fallback
                        // Store with a temporary key that we'll resolve
                        console.log(`📸 Found RichTextEditor for ${fieldName}, will match via React state`);
                    }
                }
            }
        });
        
        // Alternative: Find all contentEditable divs and try to match them to department notes
        // by checking if they're in a department note section
        const allContentEditables = document.querySelectorAll('[contenteditable="true"]');
        allContentEditables.forEach(div => {
            // Check if this is near a label we care about
            const label = div.closest('div')?.querySelector('label');
            if (label) {
                const labelText = (label.textContent || '').toLowerCase();
                let fieldName = null;
                
                if (labelText.includes('success')) {
                    fieldName = 'successes';
                } else if ((labelText.includes('week') || labelText.includes('plan')) && (labelText.includes('follow') || labelText.includes('plan'))) {
                    fieldName = 'weekToFollow';
                } else if (labelText.includes('frustrat')) {
                    fieldName = 'frustrations';
                }
                
                if (fieldName) {
                    const html = div.innerHTML || '';
                    // We'll match this to the correct deptNoteId using React state fallback
                    console.log(`📸 Found RichTextEditor ${fieldName} with content, will match via React state`);
                }
            }
        });
        
        // CRITICAL FALLBACK: Use React state values from currentMonthlyNotes
        // BUT ONLY capture values that have actually changed (not already saved)
        if (currentMonthlyNotes?.weeklyNotes) {
            currentMonthlyNotes.weeklyNotes.forEach(week => {
                if (week?.departmentNotes) {
                    week.departmentNotes.forEach(deptNote => {
                        if (deptNote?.id) {
                            // Capture all three fields, but only if they differ from last saved
                            ['successes', 'weekToFollow', 'frustrations'].forEach(field => {
                                const fieldKey = `${deptNote.id}-${field}`;
                                const value = deptNote[field] || '';
                                const lastSaved = lastSavedValues.current[fieldKey];
                                
                                // Only capture if:
                                // 1. Not already captured from DOM
                                // 2. Value differs from last saved value
                                // 3. Or it's already in pendingValues (user typed something)
                                if ((!capturedValues[fieldKey] || capturedValues[fieldKey].value !== value) &&
                                    (value !== lastSaved || pendingValues.current[fieldKey])) {
                                    capturedValues[fieldKey] = {
                                        departmentNotesId: deptNote.id,
                                        field: field,
                                        value: value
                                    };
                                    console.log(`📸 Captured React state value for ${fieldKey} (changed):`, String(value).substring(0, 50) + '...');
                                }
                            });
                        }
                    });
                }
            });
        }
        
        // Also use currentFieldValues ref as additional fallback
        Object.entries(currentFieldValues.current).forEach(([fieldKey, value]) => {
            if (!capturedValues[fieldKey] && value) {
                // Parse fieldKey to get deptNoteId and field
                const parts = fieldKey.split('-');
                if (parts.length >= 2) {
                    const deptNoteId = parts[0];
                    const field = parts.slice(1).join('-'); // Handle fields with dashes
                    capturedValues[fieldKey] = {
                        departmentNotesId: deptNoteId,
                        field: field,
                        value: value
                    };
                    console.log(`📸 Captured currentFieldValues ref for ${fieldKey} (fallback):`, String(value).substring(0, 50) + '...');
                }
            }
        });
        
        return capturedValues;
    }, [currentMonthlyNotes]); // Include currentMonthlyNotes to access latest React state
    
    // Flush all pending saves and wait for them to complete - NO TIMEOUTS, wait for ALL saves
    const flushPendingSaves = useCallback(async () => {
        // Set blocking state IMMEDIATELY
        setIsBlockingNavigation(true);
        console.log('🔒 BLOCKING NAVIGATION - Starting save flush...');
        
        // CRITICAL: Capture current values from DOM before flushing
        // This ensures we get the absolute latest typed values even if onChange hasn't fired yet
        const capturedValues = captureCurrentFieldValues();
        console.log('📸 Captured current field values from DOM:', Object.keys(capturedValues).length);
        
        // Merge captured values into pendingValues - but only if they differ from last saved
        Object.entries(capturedValues).forEach(([fieldKey, data]) => {
            if (data) {
                const lastSaved = lastSavedValues.current[fieldKey];
                // Only add to pending if it's different from last saved or already pending
                if (data.value !== lastSaved || pendingValues.current[fieldKey]) {
                    pendingValues.current[fieldKey] = data;
                    console.log(`📝 Updated pending value for ${fieldKey} from DOM capture`);
                } else {
                    console.log(`⏭️ Skipping ${fieldKey} - already saved`);
                }
            }
        });
        
        // Clear all debounce timers
        Object.keys(saveTimers.current).forEach(fieldKey => {
            clearTimeout(saveTimers.current[fieldKey]);
            delete saveTimers.current[fieldKey];
        });
        
        // Wait for ALL existing active save promises to complete - NO TIMEOUT
        const existingPromises = Array.from(activeSavePromises.current);
        if (existingPromises.length > 0) {
            console.log(`⏳ Waiting for ${existingPromises.length} existing save(s) to complete...`);
            try {
                await Promise.all(existingPromises);
                console.log('✅ All existing saves completed');
            } catch (error) {
                console.error('Error waiting for existing saves:', error);
            }
        }
        
        // Then, save any remaining pending values - ENSURE we use the LATEST value
        const pendingEntries = Object.entries(pendingValues.current);
        const newSavePromises = [];
        
        pendingEntries.forEach(([fieldKey, data]) => {
            if (data) {
                // Get auth token
                const token = localStorage.getItem('abcotronics_token') || sessionStorage.getItem('abcotronics_token');
                const baseUrl = window.API_BASE_URL || '/api';
                const url = `${baseUrl}/department-notes/${data.departmentNotesId}`;
                
                // Use the value from pendingValues - this is the latest
                const valueToSave = data.value;
                const payload = JSON.stringify({ [data.field]: valueToSave });
                
                console.log(`💾 Saving ${fieldKey}:`, valueToSave.substring(0, 50) + '...');
                
                // Create save promise - CRITICAL: Use keepalive for guaranteed delivery
                const savePromise = window.DatabaseAPI.updateDepartmentNotes(data.departmentNotesId, { [data.field]: valueToSave })
                    .then(() => {
                        // Only remove if this is still the latest value
                        const currentPending = pendingValues.current[fieldKey];
                        if (currentPending && currentPending.value === valueToSave) {
                            delete pendingValues.current[fieldKey];
                        }
                        // Update last saved value
                        lastSavedValues.current[fieldKey] = valueToSave;
                        // Remove from pending saves
                        pendingSaves.current.delete(fieldKey);
                        activeSavePromises.current.delete(savePromise);
                        console.log(`✅ Saved field ${fieldKey}`);
                    })
                    .catch((error) => {
                        console.error('Error flushing save:', error);
                        // On error, also try fetch with keepalive as fallback - CRITICAL
                        fetch(url, {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': token ? `Bearer ${token}` : ''
                            },
                            body: payload,
                            keepalive: true // Survives page unload
                        }).then(() => {
                            console.log(`✅ Fallback save succeeded for ${fieldKey}`);
                            const currentPending = pendingValues.current[fieldKey];
                            if (currentPending && currentPending.value === valueToSave) {
                                delete pendingValues.current[fieldKey];
                            }
                            // Update last saved value
                            lastSavedValues.current[fieldKey] = valueToSave;
                            // Remove from pending saves
                            pendingSaves.current.delete(fieldKey);
                        }).catch(() => {
                            console.error(`❌ Fallback save also failed for ${fieldKey}`);
                        });
                        activeSavePromises.current.delete(savePromise);
                    });
                
                activeSavePromises.current.add(savePromise);
                newSavePromises.push(savePromise);
            }
        });
        
        // Wait for ALL new saves to complete - NO TIMEOUT, wait for actual completion
        if (newSavePromises.length > 0) {
            console.log(`⏳ Waiting for ${newSavePromises.length} new save(s) to complete...`);
            try {
                await Promise.all(newSavePromises);
                console.log('✅ All new saves completed');
            } catch (error) {
                console.error('Error waiting for new saves to complete:', error);
            }
        }
        
        // Final check - wait for ANY remaining active promises - NO TIMEOUT
        let attempts = 0;
        const maxAttempts = 15; // More attempts
        while (activeSavePromises.current.size > 0 && attempts < maxAttempts) {
            const remainingPromises = Array.from(activeSavePromises.current);
            console.log(`⏳ Final check: Waiting for ${remainingPromises.length} remaining save(s)...`);
            try {
                await Promise.all(remainingPromises);
                console.log('✅ All remaining saves completed');
            } catch (error) {
                console.error('Error waiting for remaining saves:', error);
            }
            attempts++;
            // Small delay between attempts
            if (activeSavePromises.current.size > 0) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
        
        // Verify ALL saves are complete before unblocking
        const finalCheck = pendingSaves.current.size === 0 && 
                          Object.keys(pendingValues.current).length === 0 && 
                          activeSavePromises.current.size === 0;
        
        if (!finalCheck) {
            console.warn('⚠️ WARNING: Some saves may still be pending:', {
                pendingSaves: pendingSaves.current.size,
                pendingValues: Object.keys(pendingValues.current).length,
                activePromises: activeSavePromises.current.size
            });
            // Force clear after a reasonable timeout to prevent indefinite blocking
            setTimeout(() => {
                if (isBlockingNavigation) {
                    console.warn('⚠️ Force unblocking after timeout - some saves may still be in progress');
                    setIsBlockingNavigation(false);
                    // Clear any remaining pending saves to prevent re-blocking
                    pendingSaves.current.clear();
                    // Keep pendingValues in case they need to be saved later
                }
            }, 15000); // 15 second timeout
            return;
        }
        
        console.log('🔓 UNBLOCKING NAVIGATION - All saves complete');
        // Clear blocking state ONLY after verification
        setIsBlockingNavigation(false);
    }, [captureCurrentFieldValues, isBlockingNavigation]);

    // Ensure all pending saves complete before navigation
    useEffect(() => {
        const handleBeforeUnload = async (e) => {
            // If there are pending saves or active save promises, warn the user
            if (pendingSaves.current.size > 0 || 
                Object.keys(pendingValues.current).length > 0 || 
                activeSavePromises.current.size > 0) {
                // Flush any pending saves before unload (async, but we can't await in beforeunload)
                flushPendingSaves().catch(() => {});
                
                // Modern browsers ignore custom messages, but this triggers the confirmation dialog
                e.preventDefault();
                e.returnValue = '';
                return '';
            }
        };

        const handleVisibilityChange = async () => {
            // When tab becomes hidden (user navigating away), flush all pending saves
            if (document.hidden) {
                await flushPendingSaves();
            }
        };

        // Intercept ALL clicks to block navigation when saves are pending
        const handleNavClick = async (e) => {
            const target = e.target.closest('a, button, [role="button"]');
            if (!target) return;
            
            // Check if it's a navigation element (link or nav button)
            const href = target.getAttribute('href') || target.closest('a')?.getAttribute('href');
            const isNavLink = target.tagName === 'A' || 
                href ||
                target.closest('nav') || 
                target.closest('[data-nav]') ||
                target.classList.contains('nav-link') ||
                // Check for Teams component tab buttons
                (target.closest('[class*="tab"]') && target.textContent?.match(/(Documents|Workflows|Checklists|Notices|Meeting Notes|Overview)/i)) ||
                // Check for sidebar navigation
                target.closest('[class*="sidebar"]') ||
                target.closest('[class*="nav"]') ||
                // Check for any button that might navigate
                (target.tagName === 'BUTTON' && (target.onclick || target.getAttribute('onclick'))) ||
                // Check for sidebar menu items (common patterns)
                target.closest('[class*="menu-item"]') ||
                target.closest('[class*="nav-item"]');
            
            if (isNavLink) {
                const hasPendingSaves = pendingSaves.current.size > 0 || 
                    Object.keys(pendingValues.current).length > 0 || 
                    activeSavePromises.current.size > 0;
                
                if (hasPendingSaves || isBlockingNavigation) {
                    
                    // ALWAYS prevent navigation when saves are pending
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    
                    // Show blocking overlay if not already shown
                    if (!isBlockingNavigation) {
                        setIsBlockingNavigation(true);
                    }
                    
                    // Wait for all saves to complete - VERIFY before allowing navigation
                    try {
                        await flushPendingSaves();
                        
                        // VERIFY all saves are actually complete before allowing navigation
                        let verifyAttempts = 0;
                        while ((pendingSaves.current.size > 0 || 
                               Object.keys(pendingValues.current).length > 0 || 
                               activeSavePromises.current.size > 0) && 
                               verifyAttempts < 5) {
                            console.log('🔍 Verifying saves complete...', {
                                pendingSaves: pendingSaves.current.size,
                                pendingValues: Object.keys(pendingValues.current).length,
                                activePromises: activeSavePromises.current.size
                            });
                            await new Promise(resolve => setTimeout(resolve, 200));
                            verifyAttempts++;
                        }
                        
                        // Final verification - if still pending, wait more
                        if (pendingSaves.current.size > 0 || 
                            Object.keys(pendingValues.current).length > 0 || 
                            activeSavePromises.current.size > 0) {
                            console.warn('⚠️ Still has pending saves, waiting more...');
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                        
                        // Only allow navigation if truly complete
                        const isComplete = pendingSaves.current.size === 0 && 
                                          Object.keys(pendingValues.current).length === 0 && 
                                          activeSavePromises.current.size === 0;
                        
                        if (isComplete) {
                            console.log('✅ VERIFIED: All saves completed, allowing navigation');
                            // Wait a bit more for DOM updates
                            await new Promise(resolve => setTimeout(resolve, 300));
                            
                            // Re-trigger the click after saves complete
                            if (target.tagName === 'A') {
                                window.location.href = target.href;
                            } else if (target.onclick) {
                                target.onclick(e);
                            } else {
                                // Use setTimeout to ensure the click happens after current execution
                                setTimeout(() => {
                                    target.click();
                                }, 100);
                            }
                        } else {
                            console.error('❌ BLOCKED: Saves not complete, preventing navigation');
                            setIsBlockingNavigation(true);
                            // Don't allow navigation - keep blocking
                        }
                    } catch (error) {
                        console.error('Error waiting for saves before navigation:', error);
                        // On error, keep blocking to be safe
                        setIsBlockingNavigation(true);
                    }
                }
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        document.addEventListener('click', handleNavClick, true); // Capture phase
        
        // CRITICAL: Intercept RouteState navigation (MainLayout page changes)
        const interceptRouteState = () => {
            if (!window.RouteState) return null;
            
            const originalSetPage = window.RouteState.setPage;
            const originalSetPageSubpath = window.RouteState.setPageSubpath;
            
            // Wrap setPage to check for pending saves
            window.RouteState.setPage = async function(...args) {
                const meetingNotesRef = window.ManagementMeetingNotesRef;
                if (meetingNotesRef?.current?.hasPendingSaves?.() || 
                    meetingNotesRef?.current?.isBlockingNavigation?.()) {
                    console.log('🚫 RouteState.setPage BLOCKED - saves in progress...');
                    await meetingNotesRef.current.flushPendingSaves();
                    
                    // Verify saves complete
                    let verifyAttempts = 0;
                    while ((meetingNotesRef?.current?.hasPendingSaves?.() || 
                           meetingNotesRef?.current?.isBlockingNavigation?.()) && 
                           verifyAttempts < 10) {
                        await new Promise(resolve => setTimeout(resolve, 200));
                        verifyAttempts++;
                    }
                    
                    if (!meetingNotesRef?.current?.hasPendingSaves?.() && 
                        !meetingNotesRef?.current?.isBlockingNavigation?.()) {
                        console.log('✅ RouteState.setPage: All saves complete, allowing navigation');
                        return originalSetPage.apply(this, args);
                    } else {
                        console.error('❌ RouteState.setPage: Saves not complete, blocking navigation');
                        return; // Block navigation
                    }
                }
                return originalSetPage.apply(this, args);
            };
            
            // Wrap setPageSubpath to check for pending saves
            window.RouteState.setPageSubpath = async function(...args) {
                const meetingNotesRef = window.ManagementMeetingNotesRef;
                if (meetingNotesRef?.current?.hasPendingSaves?.() || 
                    meetingNotesRef?.current?.isBlockingNavigation?.()) {
                    console.log('🚫 RouteState.setPageSubpath BLOCKED - saves in progress...');
                    await meetingNotesRef.current.flushPendingSaves();
                    
                    // Verify saves complete
                    let verifyAttempts = 0;
                    while ((meetingNotesRef?.current?.hasPendingSaves?.() || 
                           meetingNotesRef?.current?.isBlockingNavigation?.()) && 
                           verifyAttempts < 10) {
                        await new Promise(resolve => setTimeout(resolve, 200));
                        verifyAttempts++;
                    }
                    
                    if (!meetingNotesRef?.current?.hasPendingSaves?.() && 
                        !meetingNotesRef?.current?.isBlockingNavigation?.()) {
                        console.log('✅ RouteState.setPageSubpath: All saves complete, allowing navigation');
                        return originalSetPageSubpath.apply(this, args);
                    } else {
                        console.error('❌ RouteState.setPageSubpath: Saves not complete, blocking navigation');
                        return; // Block navigation
                    }
                }
                return originalSetPageSubpath.apply(this, args);
            };
            
            return () => {
                // Restore original functions on cleanup
                if (window.RouteState && originalSetPage) {
                    window.RouteState.setPage = originalSetPage;
                }
                if (window.RouteState && originalSetPageSubpath) {
                    window.RouteState.setPageSubpath = originalSetPageSubpath;
                }
            };
        };
        
        const cleanupRouteState = interceptRouteState();

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            document.removeEventListener('click', handleNavClick, true);
            if (cleanupRouteState) cleanupRouteState();
            
            // Cleanup: flush pending saves and clear timers on unmount
            flushPendingSaves().catch(() => {});
        };
    }, [flushPendingSaves, isBlockingNavigation]);
    
    // Update ref when flushPendingSaves changes and expose to window
    useEffect(() => {
        managementMeetingNotesRef.current.flushPendingSaves = flushPendingSaves;
        managementMeetingNotesRef.current.flushPendingSaving = flushPendingSaves; // Alias for Teams.jsx
        managementMeetingNotesRef.current.isBlockingNavigation = () => isBlockingNavigation;
        window.ManagementMeetingNotesRef = managementMeetingNotesRef;
        return () => {
            delete window.ManagementMeetingNotesRef;
        };
    }, [flushPendingSaves, isBlockingNavigation]);

    // Get all action items for the month
    const allActionItems = useMemo(() => {
        if (!currentMonthlyNotes) return [];
        const items = [];
        
        // Monthly action items
        if (currentMonthlyNotes.actionItems) {
            items.push(...currentMonthlyNotes.actionItems.map(item => ({ ...item, source: 'monthly' })));
        }
        
        // Weekly and department action items
        if (currentMonthlyNotes.weeklyNotes) {
            currentMonthlyNotes.weeklyNotes.forEach(week => {
                if (week.actionItems) {
                    items.push(...week.actionItems.map(item => ({ ...item, source: 'weekly', weekKey: week.weekKey })));
                }
                if (week.departmentNotes) {
                    week.departmentNotes.forEach(dept => {
                        if (dept.actionItems) {
                            items.push(...dept.actionItems.map(item => ({ ...item, source: 'department', weekKey: week.weekKey, departmentId: dept.departmentId })));
                        }
                    });
                }
            });
        }
        
        return items;
    }, [currentMonthlyNotes]);

    // Get action items by status
    const actionItemsByStatus = useMemo(() => {
        const grouped = {
            open: [],
            in_progress: [],
            completed: [],
            cancelled: []
        };
        allActionItems.forEach(item => {
            if (grouped[item.status]) {
                grouped[item.status].push(item);
            }
        });
        return grouped;
    }, [allActionItems]);

    // Create monthly meeting notes
    const handleCreateMonth = async (customMonthValue = null) => {
        const monthKey =
            normalizeMonthKeyInput(
                customMonthValue ?? newMonthKey ?? selectedMonth ?? new Date()
            );

        if (!monthKey) {
            if (typeof alert === 'function') {
                alert('Please provide a valid month in YYYY-MM format.');
            }
            return null;
        }

        const triggeredByInput = Boolean((customMonthValue ?? newMonthKey) && (customMonthValue ?? newMonthKey).toString().trim());

        if (!selectedMonth || selectedMonth !== monthKey) {
            setSelectedMonth(monthKey);
        }

        const existingNotes =
            currentMonthlyNotes?.monthKey === monthKey
                ? currentMonthlyNotes
                : monthlyNotesList.find(note => note?.monthKey === monthKey);

        if (existingNotes) {
            setCurrentMonthlyNotes(existingNotes);
            setSelectedWeek(null);
            setNewMonthKey('');
            if (triggeredByInput && typeof alert === 'function') {
                alert('Monthly notes already exist for this month. Loaded the existing plan instead.');
            }
            return existingNotes;
        }

        try {
            setLoading(true);
            const response = await window.DatabaseAPI.createMonthlyNotes(monthKey, '');
            const newNotes = response.data?.monthlyNotes || response.monthlyNotes;
            if (newNotes) {
                setCurrentMonthlyNotes(newNotes);
                setMonthlyNotesList(prev => {
                    const list = Array.isArray(prev) ? [...prev] : [];
                    const existingIndex = list.findIndex(note => {
                        if (!note) return false;
                        return (note.id && newNotes.id && note.id === newNotes.id) ||
                               (note.monthKey && newNotes.monthKey && note.monthKey === newNotes.monthKey);
                    });
                    if (existingIndex >= 0) {
                        list[existingIndex] = newNotes;
                        return list;
                    }
                    list.push(newNotes);
                    return list;
                });
                setSelectedMonth(newNotes.monthKey || monthKey);
                setSelectedWeek(null);
                setNewMonthKey('');
                return newNotes;
            }
        } catch (error) {
            console.error('Error creating monthly notes:', error);
            const errorMessage = (error?.message || '').toLowerCase();
            if (errorMessage.includes('already exist')) {
                try {
                    const monthResponse = await window.DatabaseAPI.getMeetingNotes(monthKey);
                    const duplicateNotes = monthResponse?.data?.monthlyNotes || monthResponse?.monthlyNotes;
                    if (duplicateNotes) {
                        setCurrentMonthlyNotes(duplicateNotes);
                        setMonthlyNotesList(prev => {
                            const list = Array.isArray(prev) ? [...prev] : [];
                            const existingIndex = list.findIndex(note => {
                                if (!note) return false;
                                return (note.id && duplicateNotes.id && note.id === duplicateNotes.id) ||
                                       (note.monthKey && duplicateNotes.monthKey && note.monthKey === duplicateNotes.monthKey);
                            });
                            if (existingIndex >= 0) {
                                list[existingIndex] = duplicateNotes;
                                return list;
                            }
                            list.push(duplicateNotes);
                            return list;
                        });
                        setSelectedMonth(duplicateNotes.monthKey || monthKey);
                        setSelectedWeek(null);
                        setNewMonthKey('');
                        if (triggeredByInput && typeof alert === 'function') {
                            alert('Monthly notes already exist for this month. Loaded the existing plan instead.');
                        }
                        return duplicateNotes;
                    }
                    if (typeof alert === 'function') {
                        alert('Monthly notes already exist for this month.');
                    }
                } catch (loadError) {
                    console.error('Failed to load existing monthly notes after duplicate warning:', loadError);
                    if (typeof alert === 'function') {
                        alert('Monthly notes already exist for this month, but we could not load them automatically. Please refresh and try again.');
                    }
                }
            } else if (typeof alert === 'function') {
                alert('Failed to create monthly notes');
            }
        } finally {
            setLoading(false);
        }

        return null;
    };

    // Generate new monthly plan (copy from previous month)
    const handleGenerateMonth = async () => {
        if (!selectedMonth) return;
        
        const now = new Date();
        const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevMonthKey = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
        
        // If a plan already exists for the current month, reuse it instead of calling the API again
        const existingNotes =
            currentMonthlyNotes?.monthKey === currentMonthKey
                ? currentMonthlyNotes
                : monthlyNotesList.find(note => note?.monthKey === currentMonthKey);

        if (existingNotes) {
            setCurrentMonthlyNotes(existingNotes);
            setSelectedMonth(currentMonthKey);
            if (typeof alert === 'function') {
                alert('Monthly notes already exist for this month. Loaded the existing plan instead.');
            }
            return;
        }

        try {
            setLoading(true);
            const response = await window.DatabaseAPI.generateMonthlyPlan(currentMonthKey, prevMonthKey);
            const newNotes = response.data?.monthlyNotes;
            if (newNotes) {
                setCurrentMonthlyNotes(newNotes);
                setMonthlyNotesList(prev => {
                    const list = Array.isArray(prev) ? [...prev] : [];
                    const existingIndex = list.findIndex(note => {
                        if (!note) return false;
                        return (note.id && newNotes.id && note.id === newNotes.id) ||
                               (note.monthKey && newNotes.monthKey && note.monthKey === newNotes.monthKey);
                    });
                    if (existingIndex >= 0) {
                        list[existingIndex] = newNotes;
                        return list;
                    }
                    list.push(newNotes);
                    return list;
                });
                setSelectedMonth(currentMonthKey);
            }
        } catch (error) {
            console.error('Error generating monthly plan:', error);
            const errorMessage = (error?.message || '').toLowerCase();
            
            if (errorMessage.includes('already exist')) {
                console.info('Monthly plan already exists, loading current month instead.');
                try {
                    const monthResponse = await window.DatabaseAPI.getMeetingNotes(currentMonthKey);
                    const existingNotes = monthResponse?.data?.monthlyNotes;
                    
                    if (existingNotes) {
                        setCurrentMonthlyNotes(existingNotes);
                        setMonthlyNotesList(prev => {
                            const list = Array.isArray(prev) ? [...prev] : [];
                            const existingIndex = list.findIndex(note => {
                                if (!note) return false;
                                return (note.id && existingNotes.id && note.id === existingNotes.id) ||
                                       (note.monthKey && existingNotes.monthKey && note.monthKey === existingNotes.monthKey);
                            });
                            
                            if (existingIndex >= 0) {
                                list[existingIndex] = existingNotes;
                                return list;
                            }
                            
                            list.push(existingNotes);
                            return list;
                        });
                        setSelectedMonth(currentMonthKey);
                        if (typeof alert === 'function') {
                            alert('Monthly notes already exist for this month. Loaded the existing plan instead.');
                        }
                    } else if (typeof alert === 'function') {
                        alert('Monthly notes already exist for this month.');
                    }
                } catch (loadError) {
                    console.error('Failed to load existing monthly notes after duplicate warning:', loadError);
                    if (typeof alert === 'function') {
                        alert('Monthly notes already exist for this month, but we could not load them automatically. Please refresh and try again.');
                    }
                }
            } else {
                if (typeof alert === 'function') {
                    alert('Failed to generate monthly plan');
                }
            }
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteMonth = async () => {
        if (!currentMonthlyNotes) return;
        if (!confirm('Are you sure you want to delete this month and all associated weekly notes, action items, comments, and allocations? This cannot be undone.')) {
            return;
        }

        try {
            setLoading(true);
            await window.DatabaseAPI.deleteMonthlyNotes({ id: currentMonthlyNotes.id });
            await reloadMonthlyNotes();
        } catch (error) {
            console.error('Error deleting monthly notes:', error);
            if (typeof alert === 'function') {
                alert('Failed to delete monthly meeting notes.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteAllMonths = async () => {
        if (!confirm('This will delete ALL meeting notes (months, weeks, action items, comments, and allocations). Are you absolutely sure?')) {
            return;
        }

        try {
            setLoading(true);
            await window.DatabaseAPI.purgeMeetingNotes();
            await reloadMonthlyNotes();
        } catch (error) {
            console.error('Error purging meeting notes:', error);
            if (typeof alert === 'function') {
                alert('Failed to delete all meeting notes.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteWeek = async (week) => {
        if (!week?.id) return;
        if (!confirm('Delete the selected week and all associated department notes, action items, and comments? This cannot be undone.')) {
            return;
        }

        try {
            setLoading(true);
            await window.DatabaseAPI.deleteWeeklyNotes(week.id);

            const monthResponse = await window.DatabaseAPI.getMeetingNotes(selectedMonth);
            const updatedMonth = monthResponse?.data?.monthlyNotes || monthResponse?.monthlyNotes || null;

            if (updatedMonth) {
                setCurrentMonthlyNotes(updatedMonth);
                setMonthlyNotesList((prev) => {
                    if (!Array.isArray(prev)) return prev;
                    return prev.map((note) => (note?.id === updatedMonth.id ? updatedMonth : note));
                });
            } else {
                await reloadMonthlyNotes(selectedMonth);
            }

            if (selectedWeek === week.weekKey) {
                setSelectedWeek(null);
            }
        } catch (error) {
            console.error('Error deleting weekly notes:', error);
            if (typeof alert === 'function') {
                alert('Failed to delete weekly notes.');
            }
        } finally {
            setLoading(false);
        }
    };

    // Create weekly notes
    const handleCreateWeek = async (customWeekValue = null) => {
        const weekInputValue = customWeekValue ?? newWeekStartInput;
        let weekDetails = deriveWeekDetails(weekInputValue);

        if (weekInputValue && !weekDetails) {
            if (typeof alert === 'function') {
                alert('Please provide a valid week start date in YYYY-MM-DD format.');
            }
            return null;
        }

        if (!weekDetails) {
            weekDetails = deriveWeekDetails(new Date());
        }

        if (!weekDetails) {
            if (typeof alert === 'function') {
                alert('Unable to determine the week to create.');
            }
            return null;
        }

        const triggeredByInput = Boolean(weekInputValue && typeof weekInputValue === 'string' && weekInputValue.trim());

        let targetMonth =
            currentMonthlyNotes?.monthKey === weekDetails.monthKey
                ? currentMonthlyNotes
                : monthlyNotesList.find(note => note?.monthKey === weekDetails.monthKey) || null;

        if (!targetMonth) {
            const createdMonth = await handleCreateMonth(weekDetails.monthKey);
            if (!createdMonth) {
                return null;
            }
            targetMonth = createdMonth;
        }

        if (!targetMonth?.weeklyNotes) {
            try {
                const monthResponse = await window.DatabaseAPI.getMeetingNotes(targetMonth.monthKey || weekDetails.monthKey);
                const refreshedMonth = monthResponse?.data?.monthlyNotes || monthResponse?.monthlyNotes || null;
                if (refreshedMonth) {
                    targetMonth = refreshedMonth;
                    setCurrentMonthlyNotes(refreshedMonth);
                    setMonthlyNotesList(prev => {
                        const list = Array.isArray(prev) ? [...prev] : [];
                        const existingIndex = list.findIndex(note => {
                            if (!note) return false;
                            return (note.id && refreshedMonth.id && note.id === refreshedMonth.id) ||
                                   (note.monthKey && refreshedMonth.monthKey && note.monthKey === refreshedMonth.monthKey);
                        });
                        if (existingIndex >= 0) {
                            list[existingIndex] = refreshedMonth;
                            return list;
                        }
                        list.push(refreshedMonth);
                        return list;
                    });
                    setSelectedMonth(refreshedMonth.monthKey);
                }
            } catch (monthLoadError) {
                console.error('Error refreshing monthly notes before creating week:', monthLoadError);
            }
        }

        const existingWeek = targetMonth?.weeklyNotes?.find(week => week?.weekKey === weekDetails.weekKey);
        if (existingWeek) {
            setSelectedMonth(targetMonth.monthKey || weekDetails.monthKey);
            setSelectedWeek(weekDetails.weekKey);
            setNewWeekStartInput('');
            if (triggeredByInput && typeof alert === 'function') {
                alert('Weekly notes already exist for the selected dates. Loaded the existing notes instead.');
            }
            return existingWeek;
        }

        try {
            setLoading(true);
            const monthId = targetMonth?.id;
            if (!monthId) {
                if (typeof alert === 'function') {
                    alert('Unable to locate monthly notes for the selected week.');
                }
                return null;
            }

            await window.DatabaseAPI.createWeeklyNotes(
                monthId,
                weekDetails.weekKey,
                weekDetails.weekStart.toISOString(),
                weekDetails.weekEnd.toISOString()
            );

            // Send notifications to all users in the monthly notes
            if (window.DatabaseAPI && targetMonth?.userAllocations && targetMonth.userAllocations.length > 0) {
                const currentUser = window.storage?.getUserInfo() || {};
                const authorName = currentUser.name || currentUser.email || 'System';
                const weekStartStr = weekDetails.weekStart.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' });
                const weekEndStr = weekDetails.weekEnd.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' });
                
                // Get unique user IDs from allocations
                const userIds = [...new Set(targetMonth.userAllocations.map(a => a.userId))];
                
                // Send notifications asynchronously (don't wait)
                userIds.forEach(userId => {
                    if (userId && userId !== currentUser.id) {
                        const notificationPayload = {
                            userId: userId,
                            type: 'system',
                            title: 'New Week Generated',
                            message: `${authorName} created a new week (${weekStartStr} - ${weekEndStr}) for ${formatMonth(weekDetails.monthKey)}`,
                            link: `/teams?month=${weekDetails.monthKey}&week=${weekDetails.weekKey}`,
                            metadata: {
                                type: 'week_created',
                                monthKey: weekDetails.monthKey,
                                weekKey: weekDetails.weekKey,
                                weekStart: weekDetails.weekStart.toISOString(),
                                weekEnd: weekDetails.weekEnd.toISOString()
                            }
                        };
                        
                        window.DatabaseAPI.makeRequest('/notifications', {
                            method: 'POST',
                            body: JSON.stringify(notificationPayload)
                        }).catch(err => console.error('Error sending week notification:', err));
                    }
                });
            }

            await reloadMonthlyNotes(weekDetails.monthKey);
            setSelectedWeek(weekDetails.weekKey);
            setNewWeekStartInput('');
            return weekDetails.weekKey;
        } catch (error) {
            console.error('Error creating weekly notes:', error);
            const errorMessage = (error?.message || '').toLowerCase();

            if (errorMessage.includes('already exist')) {
                console.info('Weekly notes already exist for the selected week, reloading current month data.');
                try {
                    await reloadMonthlyNotes(weekDetails.monthKey);
                    setSelectedWeek(weekDetails.weekKey);
                    setNewWeekStartInput('');
                    if (triggeredByInput && typeof alert === 'function') {
                        alert('Weekly notes already exist for the selected dates. Loaded the existing notes instead.');
                    }
                } catch (loadError) {
                    console.error('Failed to reload monthly notes after duplicate weekly warning:', loadError);
                    if (typeof alert === 'function') {
                        alert('Weekly notes already exist for the selected dates, but we could not load them automatically. Please refresh and try again.');
                    }
                }
            } else if (typeof alert === 'function') {
                alert('Failed to create weekly notes');
            }
        } finally {
            setLoading(false);
        }

        return null;
    };

    // Helper function to get field key
    const getFieldKey = (departmentNotesId, field) => {
        return `${departmentNotesId}-${field}`;
    };

    // Start editing a field
    const handleStartEdit = (departmentNotesId, field, currentValue) => {
        const fieldKey = getFieldKey(departmentNotesId, field);
        setEditingFields(prev => ({ ...prev, [fieldKey]: true }));
        setTempFieldValues(prev => ({ ...prev, [fieldKey]: currentValue ?? '' }));
    };

    // Cancel editing a field
    const handleCancelEdit = (departmentNotesId, field) => {
        const fieldKey = getFieldKey(departmentNotesId, field);
        setEditingFields(prev => {
            const updated = { ...prev };
            delete updated[fieldKey];
            return updated;
        });
        setTempFieldValues(prev => {
            const updated = { ...prev };
            delete updated[fieldKey];
            return updated;
        });
    };

    // Update temporary value while editing
    const handleTempValueChange = (departmentNotesId, field, value) => {
        const fieldKey = getFieldKey(departmentNotesId, field);
        setTempFieldValues(prev => ({ ...prev, [fieldKey]: value }));
    };

    // Submit changes to a field
    const handleSubmitField = async (e, departmentNotesId, field) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        const fieldKey = getFieldKey(departmentNotesId, field);
        const value = tempFieldValues[fieldKey] ?? '';
        
        // Update local state immediately
        const monthlyId = currentMonthlyNotes?.id || null;
        updateDepartmentNotesLocal(departmentNotesId, field, value, monthlyId);

        // Save to database
        try {
            await window.DatabaseAPI.updateDepartmentNotes(departmentNotesId, { [field]: value });
            // Remove editing state after successful save
            setEditingFields(prev => {
                const updated = { ...prev };
                delete updated[fieldKey];
                return updated;
            });
            setTempFieldValues(prev => {
                const updated = { ...prev };
                delete updated[fieldKey];
                return updated;
            });
        } catch (error) {
            console.error('Error updating department notes:', error);
            if (typeof alert === 'function') {
                alert('Failed to update department notes.');
            }
            // Reload to revert local changes on error
            if (selectedMonth) {
                await reloadMonthlyNotes(selectedMonth);
            }
            // Keep editing state on error so user can retry
        }
    };

    // Update department notes (kept for backwards compatibility, but no longer used for textareas)
    const handleUpdateDepartmentNotes = async (departmentNotesId, field, value) => {
        if (!departmentNotesId) {
            return;
        }

        const monthlyId = currentMonthlyNotes?.id || null;
        updateDepartmentNotesLocal(departmentNotesId, field, value, monthlyId);

        try {
            await window.DatabaseAPI.updateDepartmentNotes(departmentNotesId, { [field]: value });
        } catch (error) {
            console.error('Error updating department notes:', error);
            if (typeof alert === 'function') {
                alert('Failed to update department notes.');
            }
            if (selectedMonth) {
                await reloadMonthlyNotes(selectedMonth);
            }
        }
    };

    // Refs for save status timeout
    const saveStatusTimeout = useRef(null);
    
    // Track the last saved value per field to avoid duplicate saves
    const lastSavedValues = useRef({});
    
    // Immediate save function - saves on every change with no debounce
    const handleFieldChange = (departmentNotesId, field, value) => {
        // Update local state immediately for responsive UI
        const monthlyId = currentMonthlyNotes?.id || null;
        updateDepartmentNotesLocal(departmentNotesId, field, value, monthlyId);
        
        const fieldKey = getFieldKey(departmentNotesId, field);
        
        // ALWAYS store the latest value - this is critical for navigation blocking
        pendingValues.current[fieldKey] = { departmentNotesId, field, value };
        
        // CRITICAL: Also track in currentFieldValues for DOM capture fallback
        currentFieldValues.current[fieldKey] = value;
        
        // Show 'saving' status
        setSaveStatus('saving');
        if (saveStatusTimeout.current) {
            clearTimeout(saveStatusTimeout.current);
        }
        
        // Mark as pending save
        pendingSaves.current.add(fieldKey);
        
        // Create save promise and track it - CRITICAL: This must complete before navigation
        const savePromise = window.DatabaseAPI.updateDepartmentNotes(departmentNotesId, { [field]: value })
            .then(() => {
                // Successfully saved - but only remove from pending if this is still the latest value
                const currentPending = pendingValues.current[fieldKey];
                if (currentPending && currentPending.value === value) {
                    // This is still the latest value, safe to remove
                    delete pendingValues.current[fieldKey];
                }
                // Always track last saved value
                lastSavedValues.current[fieldKey] = value;
                // Show 'saved' briefly then go idle
                setSaveStatus('saved');
                saveStatusTimeout.current = setTimeout(() => {
                    setSaveStatus('idle');
                }, 1500);
            })
            .catch(error => {
                console.error('Error auto-saving department notes:', error);
                // Keep in pendingValues on error - blur/navigation will retry
                // DO NOT remove from pendingValues on error - it must be saved
                setSaveStatus('idle');
            })
            .finally(() => {
                pendingSaves.current.delete(fieldKey);
                activeSavePromises.current.delete(savePromise);
            });
        
        // Track the save promise so we can wait for it during navigation
        activeSavePromises.current.add(savePromise);
        
        // CRITICAL: If blocking is not active but we have pending saves, set it
        // This ensures the overlay shows immediately when user types
        if (!isBlockingNavigation && (pendingSaves.current.size > 0 || Object.keys(pendingValues.current).length > 0)) {
            // Don't set blocking yet - only set it when navigation is attempted
            // But ensure we're ready to block
        }
    };
    
    // Flush save on blur - immediately saves the latest value
    const handleFieldBlur = (departmentNotesId, field, value) => {
        const fieldKey = getFieldKey(departmentNotesId, field);
        
        // Clear any pending debounce timer
        if (saveTimers.current[fieldKey]) {
            clearTimeout(saveTimers.current[fieldKey]);
            delete saveTimers.current[fieldKey];
        }
        
        // Get the most recent value (either from pending or passed in)
        const pendingData = pendingValues.current[fieldKey];
        const valueToSave = pendingData ? pendingData.value : value;
        
        // Mark as pending
        pendingSaves.current.add(fieldKey);
        
        // Create save promise and track it
        const savePromise = window.DatabaseAPI.updateDepartmentNotes(departmentNotesId, { [field]: valueToSave })
            .then(() => {
                // Successfully saved - clear from pending values
                delete pendingValues.current[fieldKey];
            })
            .catch(error => {
                console.error('Error saving department notes on blur:', error);
                if (selectedMonth) {
                    reloadMonthlyNotes(selectedMonth).catch(() => {});
                }
            })
            .finally(() => {
                pendingSaves.current.delete(fieldKey);
                activeSavePromises.current.delete(savePromise);
            });
        
        // Track the save promise
        activeSavePromises.current.add(savePromise);
    };

    // Track temp IDs to prevent duplicates when server responds
    const tempActionItemIds = useRef({}); // { tempId: realId }

    // Helper function to update action items in local state
    const updateActionItemLocal = useCallback((actionItem, isNew = false, tempId = null) => {
        const applyUpdate = (note) => {
            if (!note) return note;

            // Update monthly action items
            if (actionItem.monthlyNotesId && !actionItem.weeklyNotesId && !actionItem.departmentNotesId) {
                const monthlyActionItems = Array.isArray(note.actionItems) ? [...note.actionItems] : [];
                if (isNew) {
                    // Check if this temp item already exists (to prevent duplicates)
                    if (tempId && tempActionItemIds.current[tempId]) {
                        // Replace temp item with real item
                        const tempIndex = monthlyActionItems.findIndex(item => item.id === tempId);
                        if (tempIndex >= 0) {
                            monthlyActionItems[tempIndex] = actionItem;
                        } else {
                            // Check if real item already exists
                            const realIndex = monthlyActionItems.findIndex(item => item.id === actionItem.id);
                            if (realIndex >= 0) {
                                monthlyActionItems[realIndex] = actionItem;
                            } else {
                    monthlyActionItems.push(actionItem);
                            }
                        }
                    } else {
                        // Check if item with same ID already exists
                        const existingIndex = monthlyActionItems.findIndex(item => item.id === actionItem.id);
                        if (existingIndex >= 0) {
                            monthlyActionItems[existingIndex] = actionItem;
                        } else {
                            monthlyActionItems.push(actionItem);
                        }
                    }
                } else {
                    const index = monthlyActionItems.findIndex(item => item.id === actionItem.id);
                    if (index >= 0) {
                        monthlyActionItems[index] = actionItem;
                    } else {
                        // Check if there's a temp version to replace
                        if (tempId && tempActionItemIds.current[tempId]) {
                            const tempIndex = monthlyActionItems.findIndex(item => item.id === tempId);
                            if (tempIndex >= 0) {
                                monthlyActionItems[tempIndex] = actionItem;
                    } else {
                        monthlyActionItems.push(actionItem);
                            }
                        } else {
                            monthlyActionItems.push(actionItem);
                        }
                    }
                }
                return { ...note, actionItems: monthlyActionItems };
            }

            // Update weekly or department action items
            const weeklyNotes = Array.isArray(note.weeklyNotes)
                ? note.weeklyNotes.map((week) => {
                      // Update weekly-level action items
                      if (actionItem.weeklyNotesId === week.id && !actionItem.departmentNotesId) {
                          const weeklyActionItems = Array.isArray(week.actionItems) ? [...week.actionItems] : [];
                          if (isNew) {
                              if (tempId && tempActionItemIds.current[tempId]) {
                                  const tempIndex = weeklyActionItems.findIndex(item => item.id === tempId);
                                  if (tempIndex >= 0) {
                                      weeklyActionItems[tempIndex] = actionItem;
                                  } else {
                                      const realIndex = weeklyActionItems.findIndex(item => item.id === actionItem.id);
                                      if (realIndex >= 0) {
                                          weeklyActionItems[realIndex] = actionItem;
                                      } else {
                              weeklyActionItems.push(actionItem);
                                      }
                                  }
                              } else {
                                  const existingIndex = weeklyActionItems.findIndex(item => item.id === actionItem.id);
                                  if (existingIndex >= 0) {
                                      weeklyActionItems[existingIndex] = actionItem;
                                  } else {
                                      weeklyActionItems.push(actionItem);
                                  }
                              }
                          } else {
                              const index = weeklyActionItems.findIndex(item => item.id === actionItem.id);
                              if (index >= 0) {
                                  weeklyActionItems[index] = actionItem;
                              } else {
                                  if (tempId && tempActionItemIds.current[tempId]) {
                                      const tempIndex = weeklyActionItems.findIndex(item => item.id === tempId);
                                      if (tempIndex >= 0) {
                                          weeklyActionItems[tempIndex] = actionItem;
                              } else {
                                  weeklyActionItems.push(actionItem);
                                      }
                                  } else {
                                      weeklyActionItems.push(actionItem);
                                  }
                              }
                          }
                          return { ...week, actionItems: weeklyActionItems };
                      }

                      // Update department-level action items
                      if (actionItem.departmentNotesId && week.departmentNotes) {
                          const departmentNotes = week.departmentNotes.map((deptNote) => {
                              if (deptNote.id === actionItem.departmentNotesId) {
                                  const deptActionItems = Array.isArray(deptNote.actionItems) ? [...deptNote.actionItems] : [];
                                  if (isNew) {
                                      if (tempId && tempActionItemIds.current[tempId]) {
                                          const tempIndex = deptActionItems.findIndex(item => item.id === tempId);
                                          if (tempIndex >= 0) {
                                              deptActionItems[tempIndex] = actionItem;
                                          } else {
                                              const realIndex = deptActionItems.findIndex(item => item.id === actionItem.id);
                                              if (realIndex >= 0) {
                                                  deptActionItems[realIndex] = actionItem;
                                              } else {
                                      deptActionItems.push(actionItem);
                                              }
                                          }
                                      } else {
                                          const existingIndex = deptActionItems.findIndex(item => item.id === actionItem.id);
                                          if (existingIndex >= 0) {
                                              deptActionItems[existingIndex] = actionItem;
                                          } else {
                                              deptActionItems.push(actionItem);
                                          }
                                      }
                                  } else {
                                      const index = deptActionItems.findIndex(item => item.id === actionItem.id);
                                      if (index >= 0) {
                                          deptActionItems[index] = actionItem;
                                      } else {
                                          if (tempId && tempActionItemIds.current[tempId]) {
                                              const tempIndex = deptActionItems.findIndex(item => item.id === tempId);
                                              if (tempIndex >= 0) {
                                                  deptActionItems[tempIndex] = actionItem;
                                      } else {
                                          deptActionItems.push(actionItem);
                                              }
                                          } else {
                                              deptActionItems.push(actionItem);
                                          }
                                      }
                                  }
                                  return { ...deptNote, actionItems: deptActionItems };
                              }
                              return deptNote;
                          });
                          return { ...week, departmentNotes };
                      }

                      return week;
                  })
                : note.weeklyNotes;
            return { ...note, weeklyNotes };
        };

        setCurrentMonthlyNotes((prev) => (prev ? applyUpdate(prev) : prev));
        setMonthlyNotesList((prev) => {
            if (!Array.isArray(prev)) return prev;
            return prev.map((note) => (note?.id === currentMonthlyNotes?.id ? applyUpdate(note) : note));
        });
    }, [currentMonthlyNotes?.id]);

    // Create/Update action item
    const handleSaveActionItem = async (actionItemData) => {
        try {
            // Validate required fields
            if (!actionItemData.title || !actionItemData.title.trim()) {
                alert('Please enter a title for the action item');
                return;
            }

            // Ensure monthlyNotesId is set if not provided
            if (!actionItemData.monthlyNotesId && currentMonthlyNotes?.id) {
                actionItemData.monthlyNotesId = currentMonthlyNotes.id;
            }

            const isUpdate = !!editingActionItem?.id;
            const tempId = isUpdate ? null : `temp-${Date.now()}`;
            const tempActionItem = {
                ...actionItemData,
                id: editingActionItem?.id || tempId,
                createdAt: editingActionItem?.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            // Optimistic update - show immediately (only if creating new)
            if (!isUpdate) {
                updateActionItemLocal(tempActionItem, true, tempId);
            }
            setShowActionItemModal(false);
            setEditingActionItem(null);

            setLoading(true);

            let response;
            // Check if we're updating (has id) or creating (no id)
            if (isUpdate) {
                // Update existing action item
                response = await window.DatabaseAPI.updateActionItem(editingActionItem.id, actionItemData);
            } else {
                // Create new action item
                response = await window.DatabaseAPI.createActionItem(actionItemData);
            }
            
            
            // Get the actual action item from response
            const savedActionItem = response?.data?.actionItem || response?.actionItem;
            if (savedActionItem) {
                // Track temp ID mapping to prevent duplicates
                if (tempId && !isUpdate) {
                    tempActionItemIds.current[tempId] = savedActionItem.id;
                }
                // Update with server response (includes real ID and timestamps)
                // Replace temp item with real item
                updateActionItemLocal(savedActionItem, false, tempId);
                // Clean up temp ID mapping after a delay
                if (tempId) {
                    setTimeout(() => {
                        delete tempActionItemIds.current[tempId];
                    }, 5000);
                }
            } else if (response?.success) {
                // If response just indicates success, refresh from server in background
                window.DatabaseAPI.getMeetingNotes(selectedMonth)
                    .then(monthResponse => {
                        if (monthResponse?.data?.monthlyNotes) {
                            setCurrentMonthlyNotes(monthResponse.data.monthlyNotes);
                            setMonthlyNotesList((prev) => {
                                if (!Array.isArray(prev)) return prev;
                                return prev.map((note) => 
                                    (note?.id === monthResponse.data.monthlyNotes.id ? monthResponse.data.monthlyNotes : note)
                                );
                            });
                        }
                    })
                    .catch(err => console.warn('Background refresh failed:', err));
            }
        } catch (error) {
            console.error('❌ Error saving action item:', error);
            // Revert optimistic update on error
            if (selectedMonth) {
                window.DatabaseAPI.getMeetingNotes(selectedMonth)
                    .then(monthResponse => {
                        if (monthResponse?.data?.monthlyNotes) {
                            setCurrentMonthlyNotes(monthResponse.data.monthlyNotes);
                            setMonthlyNotesList((prev) => {
                                if (!Array.isArray(prev)) return prev;
                                return prev.map((note) => 
                                    (note?.id === monthResponse.data.monthlyNotes.id ? monthResponse.data.monthlyNotes : note)
                                );
                            });
                        }
                    })
                    .catch(err => console.error('Error reverting changes:', err));
            }
            alert('Failed to save action item: ' + (error.message || 'Unknown error'));
        } finally {
            setLoading(false);
        }
    };

    // Helper function to delete action item from local state
    const deleteActionItemLocal = useCallback((actionItemId) => {
        const applyDelete = (note) => {
            if (!note) return note;

            // Remove from monthly action items
            if (Array.isArray(note.actionItems)) {
                const filtered = note.actionItems.filter(item => item.id !== actionItemId);
                if (filtered.length !== note.actionItems.length) {
                    return { ...note, actionItems: filtered };
                }
            }

            // Remove from weekly or department action items
            const weeklyNotes = Array.isArray(note.weeklyNotes)
                ? note.weeklyNotes.map((week) => {
                      // Remove from weekly-level action items
                      if (Array.isArray(week.actionItems)) {
                          const filtered = week.actionItems.filter(item => item.id !== actionItemId);
                          if (filtered.length !== week.actionItems.length) {
                              return { ...week, actionItems: filtered };
                          }
                      }

                      // Remove from department-level action items
                      if (week.departmentNotes) {
                          const departmentNotes = week.departmentNotes.map((deptNote) => {
                              if (Array.isArray(deptNote.actionItems)) {
                                  const filtered = deptNote.actionItems.filter(item => item.id !== actionItemId);
                                  if (filtered.length !== deptNote.actionItems.length) {
                                      return { ...deptNote, actionItems: filtered };
                                  }
                              }
                              return deptNote;
                          });
                          return { ...week, departmentNotes };
                      }

                      return week;
                  })
                : note.weeklyNotes;
            return { ...note, weeklyNotes };
        };

        setCurrentMonthlyNotes((prev) => (prev ? applyDelete(prev) : prev));
        setMonthlyNotesList((prev) => {
            if (!Array.isArray(prev)) return prev;
            return prev.map((note) => (note?.id === currentMonthlyNotes?.id ? applyDelete(note) : note));
        });
    }, [currentMonthlyNotes?.id]);

    // Delete action item
    const handleDeleteActionItem = async (id) => {
        if (!confirm('Are you sure you want to delete this action item?')) return;
        
        // Store previous state for rollback
        const previousNotes = currentMonthlyNotes;
        
        // Optimistic update - remove immediately
        deleteActionItemLocal(id);
        
        try {
            setLoading(true);
            await window.DatabaseAPI.deleteActionItem(id);
            // Success - state already updated
        } catch (error) {
            console.error('Error deleting action item:', error);
            // Revert on error
            if (previousNotes) {
                setCurrentMonthlyNotes(previousNotes);
                setMonthlyNotesList((prev) => {
                    if (!Array.isArray(prev)) return prev;
                    return prev.map((note) => 
                        (note?.id === previousNotes.id ? previousNotes : note)
                    );
                });
            }
            alert('Failed to delete action item');
        } finally {
            setLoading(false);
        }
    };

    // Helper function to add comment to local state
    const addCommentLocal = useCallback((comment) => {
        const applyAdd = (note) => {
            if (!note) return note;

            // Add to monthly comments
            if (comment.monthlyNotesId && note.id === comment.monthlyNotesId) {
                const monthlyComments = Array.isArray(note.comments) ? [...note.comments] : [];
                monthlyComments.push(comment);
                return { ...note, comments: monthlyComments };
            }

            // Add to weekly or department comments
            const weeklyNotes = Array.isArray(note.weeklyNotes)
                ? note.weeklyNotes.map((week) => {
                      // Add to weekly-level comments
                      if (comment.weeklyNotesId === week.id) {
                          const weeklyComments = Array.isArray(week.comments) ? [...week.comments] : [];
                          weeklyComments.push(comment);
                          return { ...week, comments: weeklyComments };
                      }

                      // Add to department-level comments
                      if (comment.departmentNotesId && week.departmentNotes) {
                          const departmentNotes = week.departmentNotes.map((deptNote) => {
                              if (deptNote.id === comment.departmentNotesId) {
                                  const deptComments = Array.isArray(deptNote.comments) ? [...deptNote.comments] : [];
                                  deptComments.push(comment);
                                  return { ...deptNote, comments: deptComments };
                              }
                              return deptNote;
                          });
                          return { ...week, departmentNotes };
                      }

                      return week;
                  })
                : note.weeklyNotes;
            return { ...note, weeklyNotes };
        };

        setCurrentMonthlyNotes((prev) => (prev ? applyAdd(prev) : prev));
        setMonthlyNotesList((prev) => {
            if (!Array.isArray(prev)) return prev;
            return prev.map((note) => (note?.id === currentMonthlyNotes?.id ? applyAdd(note) : note));
        });
    }, [currentMonthlyNotes?.id]);

    // Helper function to delete comment from local state
    const deleteCommentLocal = useCallback((commentId) => {
        const applyDelete = (note) => {
            if (!note) return note;

            // Remove from monthly comments
            if (Array.isArray(note.comments)) {
                const filtered = note.comments.filter(c => c.id !== commentId);
                if (filtered.length !== note.comments.length) {
                    return { ...note, comments: filtered };
                }
            }

            // Remove from weekly or department comments
            const weeklyNotes = Array.isArray(note.weeklyNotes)
                ? note.weeklyNotes.map((week) => {
                      // Remove from weekly-level comments
                      if (Array.isArray(week.comments)) {
                          const filtered = week.comments.filter(c => c.id !== commentId);
                          if (filtered.length !== week.comments.length) {
                              return { ...week, comments: filtered };
                          }
                      }

                      // Remove from department-level comments
                      if (week.departmentNotes) {
                          const departmentNotes = week.departmentNotes.map((deptNote) => {
                              if (Array.isArray(deptNote.comments)) {
                                  const filtered = deptNote.comments.filter(c => c.id !== commentId);
                                  if (filtered.length !== deptNote.comments.length) {
                                      return { ...deptNote, comments: filtered };
                                  }
                              }
                              return deptNote;
                          });
                          return { ...week, departmentNotes };
                      }

                      return week;
                  })
                : note.weeklyNotes;
            return { ...note, weeklyNotes };
        };

        setCurrentMonthlyNotes((prev) => (prev ? applyDelete(prev) : prev));
        setMonthlyNotesList((prev) => {
            if (!Array.isArray(prev)) return prev;
            return prev.map((note) => (note?.id === currentMonthlyNotes?.id ? applyDelete(note) : note));
        });
    }, [currentMonthlyNotes?.id]);

    // Create comment with mention processing
    const handleCreateComment = async (content) => {
        if (!commentContext) return;
        
        const currentUser = window.storage?.getUserInfo() || {};
        const tempComment = {
            id: `temp-${Date.now()}`,
            content,
            author: { name: currentUser.name || currentUser.email || 'Unknown', email: currentUser.email },
            createdAt: new Date().toISOString(),
            [commentContext.type === 'monthly' ? 'monthlyNotesId' : 
              commentContext.type === 'department' ? 'departmentNotesId' : 
              'actionItemId']: commentContext.id
        };

        // Optimistic update - show immediately
        addCommentLocal(tempComment);
        setShowCommentModal(false);
        setCommentContext(null);
        
        try {
            setLoading(true);
            const commentData = {
                content,
                [commentContext.type === 'monthly' ? 'monthlyNotesId' : 
                  commentContext.type === 'department' ? 'departmentNotesId' : 
                  'actionItemId']: commentContext.id
            };
            
            const response = await window.DatabaseAPI.createComment(commentData);
            
            // Get the actual comment from response
            const savedComment = response?.data?.comment || response?.comment;
            if (savedComment) {
                // Replace temp comment with real one
                const applyReplace = (note) => {
                    if (!note) return note;

                    // Replace in monthly comments
                    if (savedComment.monthlyNotesId && note.id === savedComment.monthlyNotesId) {
                        const monthlyComments = Array.isArray(note.comments) ? [...note.comments] : [];
                        const index = monthlyComments.findIndex(c => c.id === tempComment.id);
                        if (index >= 0) {
                            monthlyComments[index] = savedComment;
                        } else {
                            monthlyComments.push(savedComment);
                        }
                        return { ...note, comments: monthlyComments };
                    }

                    // Replace in weekly or department comments
                    const weeklyNotes = Array.isArray(note.weeklyNotes)
                        ? note.weeklyNotes.map((week) => {
                              if (savedComment.weeklyNotesId === week.id) {
                                  const weeklyComments = Array.isArray(week.comments) ? [...week.comments] : [];
                                  const index = weeklyComments.findIndex(c => c.id === tempComment.id);
                                  if (index >= 0) {
                                      weeklyComments[index] = savedComment;
                                  } else {
                                      weeklyComments.push(savedComment);
                                  }
                                  return { ...week, comments: weeklyComments };
                              }

                              if (savedComment.departmentNotesId && week.departmentNotes) {
                                  const departmentNotes = week.departmentNotes.map((deptNote) => {
                                      if (deptNote.id === savedComment.departmentNotesId) {
                                          const deptComments = Array.isArray(deptNote.comments) ? [...deptNote.comments] : [];
                                          const index = deptComments.findIndex(c => c.id === tempComment.id);
                                          if (index >= 0) {
                                              deptComments[index] = savedComment;
                                          } else {
                                              deptComments.push(savedComment);
                                          }
                                          return { ...deptNote, comments: deptComments };
                                      }
                                      return deptNote;
                                  });
                                  return { ...week, departmentNotes };
                              }

                              return week;
                          })
                        : note.weeklyNotes;
                    return { ...note, weeklyNotes };
                };

                setCurrentMonthlyNotes((prev) => (prev ? applyReplace(prev) : prev));
                setMonthlyNotesList((prev) => {
                    if (!Array.isArray(prev)) return prev;
                    return prev.map((note) => (note?.id === currentMonthlyNotes?.id ? applyReplace(note) : note));
                });
            }
            
            // Process mentions and send notifications
            if (window.MentionHelper && window.MentionHelper.hasMentions(content)) {
                const authorName = currentUser.name || currentUser.email || 'Unknown';
                
                // Build context title and link
                let contextTitle = 'Meeting Notes';
                let contextLink = '/teams';
                
                if (commentContext.type === 'department') {
                    const department = DEPARTMENTS.find(d => d.id === commentContext.departmentId);
                    contextTitle = `${department?.name || 'Department'} Weekly Notes`;
                    contextLink = `/teams?month=${selectedMonth}&week=${selectedWeek}&department=${commentContext.departmentId}`;
                } else if (commentContext.type === 'monthly') {
                    contextTitle = `Monthly Meeting Notes - ${selectedMonth}`;
                    contextLink = `/teams?month=${selectedMonth}`;
                }
                
                // Process mentions asynchronously (don't wait for notifications)
                window.MentionHelper.processMentions(
                    content,
                    contextTitle,
                    contextLink,
                    authorName,
                    users
                ).catch(err => console.error('Error processing mentions:', err));
            }
        } catch (error) {
            console.error('Error creating comment:', error);
            // Revert optimistic update on error
            if (selectedMonth) {
                window.DatabaseAPI.getMeetingNotes(selectedMonth)
                    .then(monthResponse => {
                        if (monthResponse?.data?.monthlyNotes) {
                            setCurrentMonthlyNotes(monthResponse.data.monthlyNotes);
                            setMonthlyNotesList((prev) => {
                                if (!Array.isArray(prev)) return prev;
                                return prev.map((note) => 
                                    (note?.id === monthResponse.data.monthlyNotes.id ? monthResponse.data.monthlyNotes : note)
                                );
                            });
                        }
                    })
                    .catch(err => console.error('Error reverting changes:', err));
            }
            alert('Failed to create comment');
        } finally {
            setLoading(false);
        }
    };

    // Delete comment
    const handleDeleteComment = async (commentId) => {
        if (!commentId) return;
        if (!confirm('Are you sure you want to delete this comment?')) return;

        // Store previous state for rollback
        const previousNotes = currentMonthlyNotes;
        
        // Optimistic update - remove immediately
        deleteCommentLocal(commentId);
        
        try {
            setLoading(true);
            // Check if DatabaseAPI has deleteComment method, otherwise use makeRequest
            if (window.DatabaseAPI && typeof window.DatabaseAPI.deleteComment === 'function') {
                await window.DatabaseAPI.deleteComment(commentId);
            } else if (window.DatabaseAPI && typeof window.DatabaseAPI.makeRequest === 'function') {
                await window.DatabaseAPI.makeRequest(`/meeting-notes?action=comment&id=${commentId}`, {
                    method: 'DELETE',
                    body: JSON.stringify({
                        id: commentId,
                        commentId
                    })
                });
            } else {
                throw new Error('DatabaseAPI not available');
            }
            // Success - state already updated
        } catch (error) {
            console.error('Error deleting comment:', error);
            // Revert on error
            if (previousNotes) {
                setCurrentMonthlyNotes(previousNotes);
                setMonthlyNotesList((prev) => {
                    if (!Array.isArray(prev)) return prev;
                    return prev.map((note) => 
                        (note?.id === previousNotes.id ? previousNotes : note)
                    );
                });
            }
            alert('Failed to delete comment: ' + (error.message || 'Unknown error'));
        } finally {
            setLoading(false);
        }
    };

    // Update user allocation
    const handleUpdateAllocation = async (departmentId, userId, role) => {
        if (!currentMonthlyNotes) return;
        
        try {
            setLoading(true);
            await window.DatabaseAPI.updateUserAllocation(currentMonthlyNotes.id, departmentId, userId, role);
            // Reload current month's notes
            const monthResponse = await window.DatabaseAPI.getMeetingNotes(selectedMonth);
            setCurrentMonthlyNotes(monthResponse.data?.monthlyNotes);
            setShowAllocationModal(false);
        } catch (error) {
            console.error('Error updating allocation:', error);
            alert('Failed to update allocation');
        } finally {
            setLoading(false);
        }
    };

    // Delete user allocation
    const handleDeleteAllocation = async (departmentId, userId) => {
        if (!currentMonthlyNotes) return;
        
        try {
            setLoading(true);
            await window.DatabaseAPI.deleteUserAllocation(currentMonthlyNotes.id, departmentId, userId);
            // Reload current month's notes
            const monthResponse = await window.DatabaseAPI.getMeetingNotes(selectedMonth);
            setCurrentMonthlyNotes(monthResponse.data?.monthlyNotes);
        } catch (error) {
            console.error('Error deleting allocation:', error);
            alert('Failed to delete allocation');
        } finally {
            setLoading(false);
        }
    };

    // Format month display
    const formatMonth = (monthKey) => {
        if (!monthKey) return '';
        const [year, month] = monthKey.split('-');
        const date = new Date(year, parseInt(month) - 1, 1);
        return date.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
    };

    // Format week display
    const formatWeek = (weekKey, weekStart) => {
        if (weekStart) {
            const start = new Date(weekStart);
            const end = new Date(start);
            end.setDate(end.getDate() + 6);
            return `${start.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric', year: 'numeric' })}`;
        }
        return weekKey || 'Week';
    };

    // Get user name by ID
    const getUserName = (userId) => {
        const user = users.find(u => u.id === userId);
        return user?.name || user?.email || 'Unknown';
    };

    // Get department name
    const getDepartmentName = (departmentId) => {
        const dept = DEPARTMENTS.find(d => d.id === departmentId);
        return dept?.name || departmentId;
    };

    const getWeekSummaryStats = (week) => {
        const departmentNotes = Array.isArray(week?.departmentNotes) ? week.departmentNotes : [];
        const weeklyActionItems = Array.isArray(week?.actionItems) ? week.actionItems : [];

        const departmentActionItemsCount = departmentNotes.reduce((count, deptNote) => {
            if (!Array.isArray(deptNote?.actionItems)) {
                return count;
            }
            return count + deptNote.actionItems.length;
        }, 0);

        const departmentCommentsCount = departmentNotes.reduce((count, deptNote) => {
            if (!Array.isArray(deptNote?.comments)) {
                return count;
            }
            return count + deptNote.comments.length;
        }, 0);

        return {
            departmentCount: departmentNotes.length,
            totalActionItems: weeklyActionItems.length + departmentActionItemsCount,
            totalComments: departmentCommentsCount
        };
    };

    if (!isAdminUser) {
        return (
            <div className="p-4">
                <div
                    className={`rounded-lg border p-6 text-center ${
                        isDark ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-gray-200 text-gray-900'
                    }`}
                >
                    <i className={`fas fa-lock text-4xl mb-3 ${isDark ? 'text-slate-400' : 'text-gray-400'}`}></i>
                    <h2 className="text-sm font-semibold mb-2">Access Restricted</h2>
                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                        Only administrators can view the Management meeting notes.
                    </p>
                </div>
            </div>
        );
    }

    if (!isReady || loading) {
        return (
            <div className="p-4">
                <div className="text-center py-12">
                    <i className={`fas fa-clipboard-list text-4xl mb-3 ${isDark ? 'text-slate-600' : 'text-gray-300'}`}></i>
                    <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Loading meeting notes...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4 relative">
            {/* Blocking Overlay - Prevents all navigation until saves complete */}
            {isBlockingNavigation && (
                <div 
                    className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[99999]"
                    style={{ pointerEvents: 'all' }}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                >
                    <div className={`bg-white rounded-lg p-8 max-w-md mx-4 text-center ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
                        <div className="mb-4">
                            <i className="fas fa-circle-notch fa-spin text-4xl text-blue-600"></i>
                        </div>
                        <h3 className={`text-xl font-bold mb-2 ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                            Saving Your Changes
                        </h3>
                        <p className={`text-sm mb-4 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                            Please wait while we save all your changes to the database. Navigation is blocked to prevent data loss.
                        </p>
                        <div className="flex items-center justify-center gap-2 text-xs text-gray-500 mb-4">
                            <span>Active saves: {activeSavePromises.current.size}</span>
                            {Object.keys(pendingValues.current).length > 0 && (
                                <span>• Pending: {Object.keys(pendingValues.current).length}</span>
                            )}
                        </div>
                        <button
                            onClick={() => {
                                console.warn('⚠️ User force-unblocked navigation');
                                setIsBlockingNavigation(false);
                                // Clear pending saves to prevent immediate re-blocking
                                pendingSaves.current.clear();
                            }}
                            className={`px-4 py-2 text-sm rounded-lg font-medium transition ${
                                isDark 
                                    ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' 
                                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                        >
                            Force Continue (May lose unsaved changes)
                        </button>
                    </div>
                </div>
            )}
            
            {/* Header */}
            <div className={`rounded-xl border p-4 ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200 shadow-sm'}`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className={`text-xl font-bold mb-1 ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                                <i className="fas fa-clipboard-list mr-2 text-primary-600"></i>
                                Management Meeting Notes
                            </h2>
                            {/* Save Status Indicator */}
                            {saveStatus === 'saving' && (
                                <span className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-full ${isDark ? 'bg-blue-900/50 text-blue-300 border border-blue-700' : 'bg-blue-50 text-blue-600 border border-blue-200'}`}>
                                    <i className="fas fa-circle-notch fa-spin"></i>
                                    Saving...
                                </span>
                            )}
                            {saveStatus === 'saved' && (
                                <span className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-full ${isDark ? 'bg-green-900/50 text-green-300 border border-green-700' : 'bg-green-50 text-green-600 border border-green-200'}`}>
                                    <i className="fas fa-check"></i>
                                    Saved
                                </span>
                            )}
                        </div>
                        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Weekly department updates and action tracking</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <select
                            value={selectedMonth || ''}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className={`px-4 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition shadow-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100 hover:border-slate-500' : 'bg-white border-gray-300 hover:border-gray-400'}`}
                        >
                            <option value="">Select Month...</option>
                            {availableMonths.map(month => (
                                <option key={month} value={month}>{formatMonth(month)}</option>
                            ))}
                        </select>
                        <div className="flex items-center gap-2">
                            <input
                                type="month"
                                value={newMonthKey}
                                onChange={(e) => setNewMonthKey(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleCreateMonth(e.currentTarget.value);
                                    }
                                }}
                                aria-label="Create month"
                                title="Pick a month to create meeting notes ahead of time"
                                className={`w-36 px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition shadow-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`}
                            />
                            <button
                                onClick={() => handleCreateMonth()}
                                className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition shadow-sm hover:shadow-md font-medium"
                            >
                                <i className="fas fa-plus mr-1.5"></i>
                                Create Month
                            </button>
                        </div>
                        <button
                            onClick={handleGenerateMonth}
                            className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition shadow-sm hover:shadow-md font-medium"
                            title="Generate new month from previous month"
                        >
                            <i className="fas fa-magic mr-1.5"></i>
                            Generate Month
                        </button>
                        {currentMonthlyNotes && (
                            <button
                                onClick={() => setShowAllocationModal(true)}
                                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-sm hover:shadow-md font-medium"
                            >
                                <i className="fas fa-users mr-1.5"></i>
                                Allocate Users
                            </button>
                        )}
                        {currentMonthlyNotes && (
                            <button
                                onClick={handleDeleteMonth}
                                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition shadow-sm hover:shadow-md font-medium"
                            >
                                <i className="fas fa-trash mr-1.5"></i>
                                Delete Month
                            </button>
                        )}
                        {monthlyNotesList.length > 0 && (
                            <button
                                onClick={handleDeleteAllMonths}
                                className="px-4 py-2 text-sm bg-red-700 text-white rounded-lg hover:bg-red-800 transition shadow-sm hover:shadow-md font-medium"
                            >
                                <i className="fas fa-exclamation-triangle mr-1.5"></i>
                                Delete All
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Month Selection Info */}
            {selectedMonth && currentMonthlyNotes && (
                <div className={`rounded-xl border p-4 ${isDark ? 'bg-gradient-to-r from-blue-900/40 to-blue-800/30 border-blue-700/50' : 'bg-gradient-to-r from-blue-50 to-blue-100/50 border-blue-200 shadow-sm'}`}>
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <div>
                            <h3 className={`text-base font-bold mb-1 ${isDark ? 'text-blue-100' : 'text-blue-900'}`}>
                                <i className="fas fa-calendar-alt mr-2"></i>
                                {formatMonth(selectedMonth)}
                            </h3>
                            <p className={`text-xs ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
                                {weeks.length} {weeks.length === 1 ? 'week' : 'weeks'} available
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                value={newWeekStartInput}
                                onChange={(e) => setNewWeekStartInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleCreateWeek(e.currentTarget.value);
                                    }
                                }}
                                placeholder="YYYY-MM-DD"
                                aria-label="Week start date"
                                title="Pick a week start date to create notes ahead of time"
                                className={`w-36 px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition shadow-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`}
                            />
                            <button
                                onClick={() => handleCreateWeek()}
                                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-sm hover:shadow-md font-medium"
                            >
                                <i className="fas fa-plus mr-1.5"></i>
                                Add Week
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Action Items Summary */}
            {selectedMonth && currentMonthlyNotes && allActionItems.length > 0 && (
                <div className={`rounded-xl border p-5 ${isDark ? 'bg-slate-800 border-slate-700 shadow-lg' : 'bg-white border-gray-200 shadow-md'}`}>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className={`text-base font-bold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                            <i className="fas fa-tasks mr-2 text-primary-600"></i>
                            Action Items Summary
                        </h3>
                        <button
                            onClick={() => {
                                setEditingActionItem({ monthlyNotesId: currentMonthlyNotes.id });
                                setShowActionItemModal(true);
                            }}
                            className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition shadow-sm hover:shadow-md font-medium"
                        >
                            <i className="fas fa-plus mr-1.5"></i>
                            Add Action Item
                        </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                        <div className={`rounded-lg p-4 border transition hover:scale-105 ${isDark ? 'bg-gradient-to-br from-orange-900/30 to-orange-800/20 border-orange-700/50' : 'bg-gradient-to-br from-orange-50 to-orange-100/50 border-orange-200'}`}>
                            <p className={`text-xs mb-2 font-medium uppercase tracking-wide ${isDark ? 'text-orange-300' : 'text-orange-700'}`}>Open</p>
                            <p className={`text-3xl font-bold ${isDark ? 'text-orange-200' : 'text-orange-900'}`}>{actionItemsByStatus.open.length}</p>
                        </div>
                        <div className={`rounded-lg p-4 border transition hover:scale-105 ${isDark ? 'bg-gradient-to-br from-blue-900/30 to-blue-800/20 border-blue-700/50' : 'bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-200'}`}>
                            <p className={`text-xs mb-2 font-medium uppercase tracking-wide ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>In Progress</p>
                            <p className={`text-3xl font-bold ${isDark ? 'text-blue-200' : 'text-blue-900'}`}>{actionItemsByStatus.in_progress.length}</p>
                        </div>
                        <div className={`rounded-lg p-4 border transition hover:scale-105 ${isDark ? 'bg-gradient-to-br from-green-900/30 to-green-800/20 border-green-700/50' : 'bg-gradient-to-br from-green-50 to-green-100/50 border-green-200'}`}>
                            <p className={`text-xs mb-2 font-medium uppercase tracking-wide ${isDark ? 'text-green-300' : 'text-green-700'}`}>Completed</p>
                            <p className={`text-3xl font-bold ${isDark ? 'text-green-200' : 'text-green-900'}`}>{actionItemsByStatus.completed.length}</p>
                        </div>
                        <div className={`rounded-lg p-4 border transition hover:scale-105 ${isDark ? 'bg-gradient-to-br from-slate-700 to-slate-800 border-slate-600' : 'bg-gradient-to-br from-gray-100 to-gray-50 border-gray-300'}`}>
                            <p className={`text-xs mb-2 font-medium uppercase tracking-wide ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Total</p>
                            <p className={`text-3xl font-bold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{allActionItems.length}</p>
                        </div>
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {allActionItems.slice(0, 10).map((item) => (
                            <div key={item.id} className={`flex items-center justify-between p-3 rounded-lg border transition hover:shadow-sm ${isDark ? 'bg-slate-700/50 border-slate-600 hover:bg-slate-700' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}>
                                <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-medium mb-1 truncate ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{item.title}</p>
                                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                                        {item.assignedUser ? getUserName(item.assignedUserId) : 'Unassigned'} • <span className="capitalize">{item.status}</span>
                                    </p>
                                </div>
                                <div className="flex gap-2 ml-3">
                                    <button
                                        onClick={() => {
                                            setEditingActionItem(item);
                                            setShowActionItemModal(true);
                                        }}
                                        className={`p-2 rounded-lg transition ${isDark ? 'text-slate-400 hover:text-primary-400 hover:bg-primary-900/30' : 'text-gray-400 hover:text-primary-600 hover:bg-primary-50'}`}
                                        title="Edit"
                                    >
                                        <i className="fas fa-edit text-sm"></i>
                                    </button>
                                    <button
                                        onClick={() => handleDeleteActionItem(item.id)}
                                        className={`p-2 rounded-lg transition ${isDark ? 'text-slate-400 hover:text-red-400 hover:bg-red-900/30' : 'text-gray-400 hover:text-red-600 hover:bg-red-50'}`}
                                        title="Delete"
                                    >
                                        <i className="fas fa-trash text-sm"></i>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Weekly Notes Section */}
            {selectedMonth && currentMonthlyNotes && weeks.length > 0 && (
                <div className="space-y-5">
                    <div className={`rounded-xl border p-4 ${isDark ? 'bg-slate-800/60 border-slate-700 shadow-md' : 'bg-gradient-to-br from-slate-50 to-slate-100/50 border-slate-200 shadow-sm'}`}>
                        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
                            <div>
                                <p className={`text-sm font-bold uppercase tracking-wide mb-2 ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                                    <i className="fas fa-calendar-week mr-2 text-primary-600"></i>
                                    Week Navigation
                                </p>
                                <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                    Focus on the current week alongside next week while keeping earlier updates a swipe away. Scroll horizontally to move between weeks in the month.
                                </p>
                            </div>
                        </div>
                        <div className="overflow-x-auto -mx-1">
                            <div className="flex gap-3 px-1 pb-2">
                                {weeks.map((week, index) => {
                                    const rawId = getWeekIdentifier(week);
                                    const identifier = rawId || `week-${index}`;
                                    const isActualCurrentWeek = identifier === currentWeekId;
                                    const isActualNextWeek = identifier === nextWeekId;
                                    const isSelected = identifier === selectedWeek;
                                const label = 'Week Overview';
                                    return (
                                        <button
                                            key={identifier}
                                            type="button"
                                            onClick={() => {
                                                setSelectedWeek(identifier);
                                                scrollToWeekId(identifier);
                                                // Update URL with week parameter
                                                const url = new URL(window.location);
                                                url.searchParams.set('week', identifier);
                                                window.history.pushState({ week: identifier, month: selectedMonth, tab: 'meeting-notes' }, '', url);
                                            }}
                                            className={`relative whitespace-nowrap px-4 py-3 rounded-xl border text-xs font-medium transition-all duration-200 shadow-sm hover:shadow-md hover:scale-105 ${
                                                isActualCurrentWeek
                                                    ? isDark
                                                        ? 'bg-gradient-to-br from-primary-600/30 to-primary-700/20 border-primary-400 text-primary-100 shadow-primary-900/40'
                                                        : 'bg-gradient-to-br from-primary-50 to-primary-100/50 border-primary-500 text-primary-800 shadow-primary-200/50'
                                                    : isActualNextWeek
                                                        ? isDark
                                                            ? 'bg-gradient-to-br from-amber-500/30 to-amber-600/20 border-amber-400 text-amber-100 shadow-amber-900/30'
                                                            : 'bg-gradient-to-br from-amber-50 to-amber-100/50 border-amber-400 text-amber-800 shadow-amber-200/50'
                                                        : isSelected
                                                            ? isDark
                                                                ? 'bg-slate-700 border-slate-500 text-slate-200 shadow-slate-900/30'
                                                                : 'bg-slate-100 border-slate-400 text-slate-800 shadow-slate-200/40'
                                                            : isDark
                                                                ? 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500 hover:text-slate-200 hover:bg-slate-750'
                                                                : 'bg-white border-slate-300 text-slate-700 hover:border-slate-400 hover:text-slate-800 hover:bg-slate-50'
                                            }`}
                                        >
                                            <span className="block text-[10px] uppercase tracking-wider font-bold mb-1">
                                                {label}
                                            </span>
                                            <span className="block text-sm font-bold">
                                                {formatWeek(week.weekKey, week.weekStart)}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="overflow-x-auto pb-2">
                        {/* Grid layout: Departments as rows, Weeks as columns for perfect alignment */}
                        <div 
                            className="inline-grid gap-4"
                            style={{
                                gridTemplateColumns: `repeat(${weeks.length}, minmax(520px, 560px))`,
                                gridTemplateRows: `auto repeat(${DEPARTMENTS.length}, minmax(200px, max-content))`,
                                alignItems: 'stretch', // Stretch items to fill row height - ensures Compliance aligns with Management
                                gridAutoFlow: 'row' // Ensure items flow row by row
                            }}
                        >
                            {/* Week headers row */}
                            {weeks.map((week, index) => {
                                const rawId = getWeekIdentifier(week);
                                const identifier = rawId || `week-${index}`;
                                const isActualCurrentWeek = identifier === currentWeekId;
                                const isActualNextWeek = identifier === nextWeekId;
                                const isSelected = identifier === selectedWeek;
                                const summary = getWeekSummaryStats(week);

                                return (
                                    <div
                                        key={`header-${identifier}`}
                                        ref={(node) => {
                                            if (!weekCardRefs.current) {
                                                weekCardRefs.current = {};
                                            }
                                            if (node && index === 0) {
                                                weekCardRefs.current[identifier] = node;
                                            }
                                        }}
                                        style={{
                                            gridRow: '1',
                                            gridColumn: `${index + 1}`
                                        }}
                                        className={`rounded-xl border-2 p-5 transition-all duration-300 ${
                                            isActualCurrentWeek
                                                ? isDark
                                                    ? 'border-primary-400 shadow-xl shadow-primary-900/50 bg-gradient-to-br from-slate-800 to-slate-900'
                                                    : 'border-primary-500 shadow-xl shadow-primary-200/60 bg-gradient-to-br from-white to-primary-50/30'
                                                : isActualNextWeek
                                                    ? isDark
                                                        ? 'border-amber-400 shadow-lg shadow-amber-900/40 bg-gradient-to-br from-slate-800 to-slate-900'
                                                        : 'border-amber-400 shadow-lg shadow-amber-100/60 bg-gradient-to-br from-white to-amber-50/30'
                                                    : isSelected
                                                        ? isDark
                                                            ? 'border-slate-500 shadow-lg shadow-slate-900/30 bg-gradient-to-br from-slate-800 to-slate-900'
                                                            : 'border-slate-400 shadow-lg shadow-slate-200/50 bg-gradient-to-br from-white to-slate-50'
                                                        : isDark
                                                            ? 'border-slate-700 bg-slate-800 hover:border-slate-600 hover:shadow-md'
                                                            : 'border-gray-300 bg-white hover:border-gray-400 hover:shadow-md'
                                        }`}
                                    >
                                            <div className="flex items-start justify-between gap-3 mb-4">
                                                <div className="flex-1">
                                                    <p className={`text-xs uppercase tracking-wider font-bold mb-1 ${isActualCurrentWeek ? (isDark ? 'text-primary-300' : 'text-primary-600') : isActualNextWeek ? (isDark ? 'text-amber-300' : 'text-amber-600') : isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                        Week Overview
                                                    </p>
                                                    <h3 className={`text-base font-bold flex items-center ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                                                        <i className={`fas fa-calendar-week mr-2 ${isActualCurrentWeek ? 'text-primary-500' : isActualNextWeek ? 'text-amber-500' : 'text-slate-500'}`}></i>
                                                        {formatWeek(week.weekKey, week.weekStart)}
                                                    </h3>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {!isSelected && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedWeek(identifier);
                                                                scrollToWeekId(identifier);
                                                                const url = new URL(window.location);
                                                                url.searchParams.set('week', identifier);
                                                                window.history.pushState({ week: identifier, month: selectedMonth, tab: 'meeting-notes' }, '', url);
                                                            }}
                                                            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition shadow-sm hover:shadow-md ${isDark ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                                                        >
                                                            <i className="fas fa-crosshairs mr-1"></i>
                                                            Focus
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteWeek(week)}
                                                        className={`text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition shadow-sm hover:shadow-md ${isDark ? 'bg-red-900/50 text-red-200 hover:bg-red-800/50 border border-red-700' : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'}`}
                                                    >
                                                        <i className="fas fa-trash"></i>
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-3 gap-3">
                                                <div className={`rounded-lg border p-3 transition hover:scale-105 ${isDark ? 'border-slate-600 bg-slate-900/40 text-slate-200' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                                                    <p className="text-[10px] uppercase tracking-wide font-medium mb-1">Departments</p>
                                                    <p className="text-lg font-bold">{summary.departmentCount}</p>
                                                </div>
                                                <div className={`rounded-lg border p-3 transition hover:scale-105 ${isDark ? 'border-slate-600 bg-slate-900/40 text-slate-200' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                                                    <p className="text-[10px] uppercase tracking-wide font-medium mb-1">Action Items</p>
                                                    <p className="text-lg font-bold">{summary.totalActionItems}</p>
                                                </div>
                                                <div className={`rounded-lg border p-3 transition hover:scale-105 ${isDark ? 'border-slate-600 bg-slate-900/40 text-slate-200' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                                                    <p className="text-[10px] uppercase tracking-wide font-medium mb-1">Comments</p>
                                                    <p className="text-lg font-bold">{summary.totalComments}</p>
                                                </div>
                                            </div>
                                    </div>
                                );
                            })}
                            
                            {/* Department rows - each department spans all weeks */}
                            {DEPARTMENTS.map((dept, deptIndex) => {
                                return weeks.map((week, weekIndex) => {
                                    const rawId = getWeekIdentifier(week);
                                    const identifier = rawId || `week-${weekIndex}`;
                                    const deptNote = week.departmentNotes?.find(
                                        (dn) => dn.departmentId === dept.id
                                    );

                                    return (
                                        <div
                                            key={`${dept.id}-${identifier}`}
                                            className={`rounded-xl border-2 p-4 transition-all duration-200 h-full flex flex-col hover:shadow-md ${
                                                !deptNote 
                                                    ? `border-dashed opacity-60 ${isDark ? 'border-slate-600 bg-slate-800/50' : 'border-gray-300 bg-gray-50/50'}`
                                                    : `${isDark ? 'border-slate-700 bg-slate-800 hover:border-slate-600' : 'border-gray-300 bg-white hover:border-gray-400'}`
                                            }`}
                                            style={{ 
                                                minHeight: '200px',
                                                gridRow: `${deptIndex + 2}`, // +2 because row 1 is headers
                                                gridColumn: `${weekIndex + 1}` // +1 because columns start at 1
                                            }}
                                        >
                                            {!deptNote ? (
                                                <>
                                                    <div className="flex items-center justify-between mb-3">
                                                        <h4 className={`text-sm font-semibold flex items-center gap-2 ${isDark ? `text-${dept.color}-300` : `text-${dept.color}-700`}`}>
                                                            <i className={`fas ${dept.icon} ${isDark ? `text-${dept.color}-400` : `text-${dept.color}-600`}`}></i>
                                                            {dept.name}
                                                        </h4>
                                                        <div className="flex gap-2">
                                                            {currentMonthlyNotes.userAllocations?.filter((a) => a.departmentId === dept.id).length > 0 && (
                                                                <div className="flex gap-1">
                                                                    {currentMonthlyNotes.userAllocations
                                                                        .filter((a) => a.departmentId === dept.id)
                                                                        .map((allocation) => (
                                                                            <span key={allocation.id} className={`text-xs px-2 py-1 rounded ${isDark ? 'bg-slate-700 text-slate-200' : 'bg-gray-100 text-gray-700'}`}>
                                                                                {getUserName(allocation.userId)}
                                                                            </span>
                                                                        ))}
                                                                </div>
                                                            )}
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedDepartment(dept.id);
                                                                    setShowAllocationModal(true);
                                                                }}
                                                                className={`text-xs px-2 py-1 rounded ${isDark ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                                                                title="Allocate users"
                                                            >
                                                                <i className="fas fa-user-plus"></i>
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className={`text-center py-4 ${isDark ? 'text-slate-400' : 'text-gray-400'}`}>
                                                        <p className="text-xs">No notes for this department yet</p>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="flex items-center justify-between mb-3">
                                                        <h4 className={`text-sm font-semibold flex items-center gap-2 ${isDark ? `text-${dept.color}-300` : `text-${dept.color}-700`}`}>
                                                            <i className={`fas ${dept.icon} ${isDark ? `text-${dept.color}-400` : `text-${dept.color}-600`}`}></i>
                                                            {dept.name}
                                                        </h4>
                                                        <div className="flex gap-2">
                                                            {currentMonthlyNotes.userAllocations?.filter((a) => a.departmentId === dept.id).length > 0 && (
                                                                <div className="flex gap-1">
                                                                    {currentMonthlyNotes.userAllocations
                                                                        .filter((a) => a.departmentId === dept.id)
                                                                        .map((allocation) => (
                                                                            <span key={allocation.id} className={`text-xs px-2 py-1 rounded ${isDark ? 'bg-slate-700 text-slate-200' : 'bg-gray-100 text-gray-700'}`}>
                                                                                {getUserName(allocation.userId)}
                                                                            </span>
                                                                        ))}
                                                                </div>
                                                            )}
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedDepartment(dept.id);
                                                                    setShowAllocationModal(true);
                                                                }}
                                                                className={`text-xs px-2 py-1 rounded ${isDark ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                                                                title="Allocate users"
                                                            >
                                                                <i className="fas fa-user-plus"></i>
                                                            </button>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="space-y-3 flex-grow">
                                                        {/* Successes */}
                                                        <div>
                                                            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                                                                    Last Week's Successes
                                                                </label>
                                                            {window.RichTextEditor ? (
                                                                <window.RichTextEditor
                                                                    value={deptNote.successes || ''}
                                                                    onChange={(html) => handleFieldChange(deptNote.id, 'successes', html)}
                                                                    onBlur={(html) => handleFieldBlur(deptNote.id, 'successes', html)}
                                placeholder="What went well during the week? (Use formatting toolbar for bullets, bold, etc.)"
                                                                    rows={4}
                                                                    isDark={isDark}
                                                                />
                                                            ) : (
                                                                <textarea
                                                                    value={deptNote.successes || ''}
                                                                    onChange={(e) => handleFieldChange(deptNote.id, 'successes', e.target.value)}
                                                                    onBlur={(e) => handleFieldBlur(deptNote.id, 'successes', e.target.value)}
                                                                    placeholder="What went well during the week?"
                                                                    className={`w-full min-h-[80px] p-2 text-xs border rounded-lg ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300'}`}
                                                                    rows={4}
                                                                    data-dept-note-id={deptNote.id}
                                                                    data-field="successes"
                                                                />
                                                            )}
                                                        </div>

                                                        {/* Week to Follow */}
                                                        <div>
                                                            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                                                                    Weekly Plan
                                                                </label>
                                                            {window.RichTextEditor ? (
                                                                <window.RichTextEditor
                                                                    value={deptNote.weekToFollow || ''}
                                                                    onChange={(html) => handleFieldChange(deptNote.id, 'weekToFollow', html)}
                                                                    onBlur={(html) => handleFieldBlur(deptNote.id, 'weekToFollow', html)}
                                                                    placeholder="What's planned for the upcoming week? (Use formatting toolbar for bullets, bold, etc.)"
                                                                    rows={4}
                                                                    isDark={isDark}
                                                                />
                                                            ) : (
                                                                <textarea
                                                                    value={deptNote.weekToFollow || ''}
                                                                    onChange={(e) => handleFieldChange(deptNote.id, 'weekToFollow', e.target.value)}
                                                                    onBlur={(e) => handleFieldBlur(deptNote.id, 'weekToFollow', e.target.value)}
                                                                    placeholder="What's planned for the upcoming week?"
                                                                    className={`w-full min-h-[80px] p-2 text-xs border rounded-lg ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300'}`}
                                                                    rows={4}
                                                                    data-dept-note-id={deptNote.id}
                                                                    data-field="weekToFollow"
                                                                />
                                                            )}
                                                        </div>

                                                        {/* Frustrations */}
                                                        <div>
                                                            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                                                                    Frustrations/Challenges
                                                                </label>
                                                            {window.RichTextEditor ? (
                                                                <window.RichTextEditor
                                                                    value={deptNote.frustrations || ''}
                                                                    onChange={(html) => handleFieldChange(deptNote.id, 'frustrations', html)}
                                                                    onBlur={(html) => handleFieldBlur(deptNote.id, 'frustrations', html)}
                                                                    placeholder="What challenges or blockers are we facing? (Use formatting toolbar for bullets, bold, etc.)"
                                                                    rows={4}
                                                                    isDark={isDark}
                                                                />
                                                            ) : (
                                                                <textarea
                                                                    value={deptNote.frustrations || ''}
                                                                    onChange={(e) => handleFieldChange(deptNote.id, 'frustrations', e.target.value)}
                                                                    onBlur={(e) => handleFieldBlur(deptNote.id, 'frustrations', e.target.value)}
                                                                    placeholder="What challenges or blockers are we facing?"
                                                                    className={`w-full min-h-[80px] p-2 text-xs border rounded-lg ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300'}`}
                                                                    rows={4}
                                                                    data-dept-note-id={deptNote.id}
                                                                    data-field="frustrations"
                                                                />
                                                            )}
                                                        </div>

                                                        {/* Action Items */}
                                                        {deptNote.actionItems && deptNote.actionItems.length > 0 && (
                                                            <div>
                                                                <label className={`block text-xs font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                                                                    Action Items
                                                                </label>
                                                                <div className="space-y-2">
                                                                    {deptNote.actionItems.map((item) => (
                                                                        <div key={item.id} className={`flex items-center justify-between p-2 rounded transition-all duration-200 ${isDark ? 'bg-slate-700' : 'bg-gray-50'}`}>
                                                                            <div className="flex-1">
                                                                                <p className={`text-xs font-medium ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{item.title}</p>
                                                                                {item.description && (
                                                                                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>{item.description}</p>
                                                                                )}
                                                                            </div>
                                                                            <div className="flex gap-1">
                                                                                <button
                                                                                    onClick={() => {
                                                                                        setEditingActionItem(item);
                                                                                        setShowActionItemModal(true);
                                                                                    }}
                                                                                    className={`p-1 ${isDark ? 'text-slate-400 hover:text-primary-400' : 'text-gray-400 hover:text-primary-600'}`}
                                                                                >
                                                                                    <i className="fas fa-edit text-xs"></i>
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Comments */}
                                                        {deptNote.comments && deptNote.comments.length > 0 && (
                                                            <div>
                                                                <label className={`block text-xs font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                                                                    Comments
                                                                </label>
                                                                <div className="space-y-2">
                                                                    {deptNote.comments.map((comment) => {
                                                                        let displayContent = comment.content || '';
                                                                        if (window.MentionHelper && displayContent) {
                                                                            displayContent = window.MentionHelper.highlightMentions(displayContent, isDark);
                                                                        }
                                                                        
                                                                        return (
                                                                            <div key={comment.id} className={`p-3 rounded-lg border transition-all duration-200 hover:shadow-sm ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-200'}`}>
                                                                                <div className="flex items-start justify-between gap-2">
                                                                                    <div className="flex-1 min-w-0">
                                                                                        <p 
                                                                                            className={`text-xs ${isDark ? 'text-slate-100' : 'text-gray-900'}`}
                                                                                            dangerouslySetInnerHTML={{ __html: displayContent }}
                                                                                        />
                                                                                        <p className={`text-xs mt-2 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                                                                                            {comment.author ? (comment.author.name || comment.author.email) : 'Unknown'} • {new Date(comment.createdAt).toLocaleDateString()}
                                                                                        </p>
                                                                                    </div>
                                                                                    <button
                                                                                        onClick={() => handleDeleteComment(comment.id)}
                                                                                        className={`p-1.5 rounded-lg transition flex-shrink-0 ${isDark ? 'text-slate-400 hover:text-red-400 hover:bg-red-900/30' : 'text-gray-400 hover:text-red-600 hover:bg-red-50'}`}
                                                                                        title="Delete comment"
                                                                                    >
                                                                                        <i className="fas fa-trash text-xs"></i>
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Add Comment Button */}
                                                        <button
                                                            onClick={() => {
                                                                setCommentContext({ 
                                                                    type: 'department', 
                                                                    id: deptNote.id,
                                                                    departmentId: deptNote.departmentId,
                                                                    title: `${DEPARTMENTS.find(d => d.id === deptNote.departmentId)?.name || 'Department'} Weekly Notes`
                                                                });
                                                                setShowCommentModal(true);
                                                            }}
                                                            className={`w-full text-xs px-3 py-2 rounded ${isDark ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                                                        >
                                                            <i className="fas fa-comment mr-1"></i>
                                                            Add Comment
                                                        </button>

                                                        {/* Add Action Item Button */}
                                                        <button
                                                            onClick={() => {
                                                                setEditingActionItem({ 
                                                                    monthlyNotesId: currentMonthlyNotes?.id,
                                                                    weeklyNotesId: week.id, 
                                                                    departmentNotesId: deptNote.id 
                                                                });
                                                                setShowActionItemModal(true);
                                                            }}
                                                            className={`w-full text-xs px-3 py-2 rounded ${isDark ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                                                        >
                                                            <i className="fas fa-plus mr-1"></i>
                                                            Add Action Item
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    );
                                });
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Empty State */}
            {selectedMonth && !currentMonthlyNotes && (
                <div className={`rounded-lg border p-8 text-center ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                    <i className={`fas fa-clipboard-list text-4xl mb-3 ${isDark ? 'text-slate-600' : 'text-gray-300'}`}></i>
                    <p className={`text-sm mb-4 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                        No meeting notes for {formatMonth(selectedMonth)} yet.
                    </p>
                    <button
                        onClick={handleCreateMonth}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-xs"
                    >
                        Create Month Notes
                    </button>
                </div>
            )}

            {!selectedMonth && (
                <div className={`rounded-lg border p-8 text-center ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                    <i className={`fas fa-calendar text-4xl mb-3 ${isDark ? 'text-slate-600' : 'text-gray-300'}`}></i>
                    <p className={`text-sm mb-4 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                        Select a month to view or create meeting notes.
                    </p>
                </div>
            )}

            {/* User Allocation Modal */}
            {showAllocationModal && currentMonthlyNotes && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className={`rounded-lg border p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className={`text-lg font-semibold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                                Allocate Users to Departments
                            </h3>
                            <button
                                onClick={() => setShowAllocationModal(false)}
                                className={`p-1 ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        <div className="space-y-4">
                            {DEPARTMENTS.map(dept => {
                                                        const allocations = currentMonthlyNotes.userAllocations?.filter(
                                    a => a.departmentId === dept.id
                                                        ) || [];
                                                        return (
                                                            <div key={dept.id} className={`border rounded-lg p-3 ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
                                        <h4 className={`text-sm font-semibold mb-2 ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{dept.name}</h4>
                                        <div className="space-y-2">
                                            {allocations.map(allocation => (
                                                <div key={allocation.id} className="flex items-center justify-between">
                                                    <span className={`text-xs ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                                                        {getUserName(allocation.userId)} ({allocation.role})
                                                    </span>
                                                    <button
                                                        onClick={() => handleDeleteAllocation(dept.id, allocation.userId)}
                                                        className={`text-xs px-2 py-1 rounded ${isDark ? 'bg-red-900 text-red-200 hover:bg-red-800' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            ))}
                                            <select
                                                onChange={(e) => {
                                                    if (e.target.value) {
                                                        handleUpdateAllocation(dept.id, e.target.value, 'contributor');
                                                        e.target.value = '';
                                                    }
                                                }}
                                                className={`w-full text-xs px-2 py-1 border rounded ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300'}`}
                                            >
                                                <option value="">Add user...</option>
                                                {users.filter(u => !allocations.find(a => a.userId === u.id)).map(user => (
                                                    <option key={user.id} value={user.id}>{user.name || user.email}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Action Item Modal */}
            {showActionItemModal && currentMonthlyNotes && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className={`rounded-lg border p-6 max-w-lg w-full ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className={`text-lg font-semibold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                                {editingActionItem ? 'Edit Action Item' : 'Add Action Item'}
                            </h3>
                            <button
                                onClick={() => {
                                    setShowActionItemModal(false);
                                    setEditingActionItem(null);
                                }}
                                className={`p-1 ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        <ActionItemForm
                            actionItem={editingActionItem}
                            monthlyNotesId={currentMonthlyNotes.id}
                            users={users}
                            isDark={isDark}
                            onSave={handleSaveActionItem}
                            onCancel={() => {
                                setShowActionItemModal(false);
                                setEditingActionItem(null);
                            }}
                        />
                    </div>
                </div>
            )}

            {/* Comment Modal */}
            {showCommentModal && commentContext && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className={`rounded-lg border p-6 max-w-lg w-full ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className={`text-lg font-semibold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>Add Comment</h3>
                            <button
                                onClick={() => {
                                    setShowCommentModal(false);
                                    setCommentContext(null);
                                }}
                                className={`p-1 ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        <CommentForm
                            isDark={isDark}
                            commentContext={commentContext}
                            users={users}
                            onSubmit={handleCreateComment}
                            onCreateActionItem={(actionItemData) => {
                                // Close comment modal and open action item modal
                                setShowCommentModal(false);
                                setCommentContext(null);
                                
                                // Merge action item data with comment context
                                const newActionItem = {
                                    ...actionItemData,
                                    monthlyNotesId: currentMonthlyNotes?.id,
                                    weeklyNotesId: commentContext.type === 'department' ? selectedWeek : null,
                                    departmentNotesId: commentContext.type === 'department' ? commentContext.id : null
                                };
                                
                                setEditingActionItem(newActionItem);
                                setShowActionItemModal(true);
                            }}
                            onCancel={() => {
                                setShowCommentModal(false);
                                setCommentContext(null);
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

// Action Item Form Component with rich text support
const ActionItemForm = ({ actionItem, monthlyNotesId, users, isDark, onSave, onCancel }) => {
    const [title, setTitle] = useState(actionItem?.title || '');
    const [description, setDescription] = useState(actionItem?.description || '');
    const [status, setStatus] = useState(actionItem?.status || 'open');
    const [priority, setPriority] = useState(actionItem?.priority || 'medium');
    const [assignedUserId, setAssignedUserId] = useState(actionItem?.assignedUserId || '');
    const [dueDate, setDueDate] = useState(actionItem?.dueDate ? new Date(actionItem.dueDate).toISOString().split('T')[0] : '');

    // Handle initial values from comment
    useEffect(() => {
        if (actionItem?.fromComment && actionItem?.title && actionItem?.description) {
            setTitle(actionItem.title);
            setDescription(actionItem.description);
        }
    }, [actionItem]);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({
            monthlyNotesId: actionItem?.monthlyNotesId || monthlyNotesId,
            weeklyNotesId: actionItem?.weeklyNotesId || null,
            departmentNotesId: actionItem?.departmentNotesId || null,
            title,
            description,
            status,
            priority,
            assignedUserId: assignedUserId || null,
            dueDate: dueDate || null
        });
    };

    const RichTextEditor = window.RichTextEditor || null;

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Title *</label>
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300'}`}
                />
            </div>
            <div>
                <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                    Description <span className="text-xs opacity-70">(supports rich text formatting)</span>
                </label>
                {RichTextEditor ? (
                    <RichTextEditor
                        value={description}
                        onChange={(html) => setDescription(html)}
                        placeholder="Enter description with formatting (bold, bullets, etc.)"
                        rows={4}
                        isDark={isDark}
                    />
                ) : (
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300'}`}
                        rows="4"
                        placeholder="Enter description..."
                    />
                )}
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Status</label>
                    <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className={`w-full px-3 py-2 text-sm border rounded-lg ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300'}`}
                    >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                </div>
                <div>
                    <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Priority</label>
                    <select
                        value={priority}
                        onChange={(e) => setPriority(e.target.value)}
                        className={`w-full px-3 py-2 text-sm border rounded-lg ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300'}`}
                    >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                    </select>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Assigned To</label>
                    <select
                        value={assignedUserId}
                        onChange={(e) => setAssignedUserId(e.target.value)}
                        className={`w-full px-3 py-2 text-sm border rounded-lg ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300'}`}
                    >
                        <option value="">Unassigned</option>
                        {users.map(user => (
                            <option key={user.id} value={user.id}>{user.name || user.email}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Due Date</label>
                    <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className={`w-full px-3 py-2 text-sm border rounded-lg ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300'}`}
                    />
                </div>
            </div>
            <div className="flex gap-2 justify-end">
                <button
                    type="button"
                    onClick={onCancel}
                    className={`px-4 py-2 text-sm rounded-lg ${isDark ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                    Save
                </button>
            </div>
        </form>
    );
};

// Comment Form Component with mention support and action item creation
const CommentForm = ({ isDark, onSubmit, onCancel, commentContext, onCreateActionItem, users = [] }) => {
    const [content, setContent] = useState('');
    const textareaRef = useRef(null);

    const handleSubmit = (commentText) => {
        if (commentText && commentText.trim()) {
            onSubmit(commentText);
            setContent('');
        }
    };

    const handleTextareaChange = (e) => {
        setContent(e.target.value);
    };

    const handleCreateActionItemFromComment = () => {
        const textContent = textareaRef.current?.value || content;
        if (textContent.trim() && onCreateActionItem) {
            // Extract first line as title, rest as description
            const lines = textContent.split('\n').filter(l => l.trim());
            const title = lines[0]?.trim() || 'Action Item from Comment';
            const description = lines.slice(1).join('\n').trim() || textContent.trim();
            
            onCreateActionItem({
                title,
                description,
                fromComment: true,
                commentText: textContent
            });
            setContent('');
        }
    };

    // Use CommentInputWithMentions if available, otherwise fallback to regular textarea
    const CommentInput = window.CommentInputWithMentions || null;

    if (CommentInput) {
        // Use CommentInputWithMentions component
        return (
            <div className="space-y-4">
                <div>
                    <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                        Comment <span className="text-xs opacity-70">(@mention users to notify them)</span>
                    </label>
                    <CommentInput
                        onSubmit={handleSubmit}
                        placeholder="Add a comment... (@mention users, Shift+Enter for new line, Enter to send)"
                        rows={4}
                        taskTitle={commentContext?.title || 'Meeting Notes'}
                        taskLink="/teams"
                        showButton={true}
                    />
                </div>
                
                <div className="flex gap-2 justify-end">
                    <button
                        type="button"
                        onClick={onCancel}
                        className={`px-4 py-2 text-sm rounded-lg ${isDark ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

    // Fallback to regular textarea with action item creation
    return (
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(content); }} className="space-y-4">
            <div>
                <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                    Comment <span className="text-xs opacity-70">(@mention users to notify them)</span>
                </label>
                <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={handleTextareaChange}
                    required
                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300'}`}
                    rows="4"
                    placeholder="Add a comment... (@mention users, Shift+Enter for new line, Enter to send)"
                />
            </div>
            <div className="flex gap-2 justify-end">
                <button
                    type="button"
                    onClick={onCancel}
                    className={`px-4 py-2 text-sm rounded-lg ${isDark ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                    Cancel
                </button>
                {onCreateActionItem && (
                    <button
                        type="button"
                        onClick={handleCreateActionItemFromComment}
                        className={`px-4 py-2 text-sm rounded-lg ${isDark ? 'bg-purple-700 text-purple-200 hover:bg-purple-600' : 'bg-purple-100 text-purple-700 hover:bg-purple-200'}`}
                    >
                        <i className="fas fa-tasks mr-1"></i>
                        Create Action Item
                    </button>
                )}
                <button
                    type="submit"
                    className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                    Post Comment
                </button>
            </div>
        </form>
    );
};

// Make available globally
window.ManagementMeetingNotes = ManagementMeetingNotes;

