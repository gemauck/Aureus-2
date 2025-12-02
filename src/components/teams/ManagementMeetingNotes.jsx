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

    // Preserve scroll position on page load/refresh - AGGRESSIVE VERSION
    useEffect(() => {
        // Save scroll position before page unload
        const saveScrollOnUnload = () => {
            const scrollY = window.scrollY || window.pageYOffset;
            if (scrollY > 0) {
                sessionStorage.setItem('managementMeetingNotes_scroll', scrollY.toString());
            }
        };
        
        // Restore scroll position on page load - AGGRESSIVE with multiple attempts
        const restoreScrollOnLoad = () => {
            const savedScroll = sessionStorage.getItem('managementMeetingNotes_scroll');
            if (savedScroll) {
                const scrollY = parseInt(savedScroll, 10);
                if (scrollY > 0) {
                    // Immediate restoration
                    window.scrollTo(0, scrollY);
                    
                    // Multiple restoration attempts to handle React re-renders and DOM updates
                    requestAnimationFrame(() => {
                        window.scrollTo(0, scrollY);
                    });
                    
                    setTimeout(() => {
                        window.scrollTo(0, scrollY);
                    }, 0);
                    
                    setTimeout(() => {
                        window.scrollTo(0, scrollY);
                    }, 10);
                    
                    setTimeout(() => {
                        window.scrollTo(0, scrollY);
                    }, 50);
                    
                        setTimeout(() => {
                            window.scrollTo(0, scrollY);
                        }, 100);
                    
                    setTimeout(() => {
                        window.scrollTo(0, scrollY);
                    }, 200);
                    
                        setTimeout(() => {
                            window.scrollTo(0, scrollY);
                        }, 500);
                    
                    setTimeout(() => {
                        window.scrollTo(0, scrollY);
                    }, 1000);
                }
            }
        };
        
        // Restore scroll on mount - immediate
        restoreScrollOnLoad();
        
        // Also restore on DOMContentLoaded if not already restored
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', restoreScrollOnLoad);
        }
        
        // Save scroll on unload
        window.addEventListener('beforeunload', saveScrollOnUnload);
        
        // Also save scroll periodically
        const scrollSaveInterval = setInterval(() => {
            const scrollY = window.scrollY || window.pageYOffset;
            if (scrollY > 0) {
                sessionStorage.setItem('managementMeetingNotes_scroll', scrollY.toString());
            }
        }, 1000);
        
        return () => {
            window.removeEventListener('beforeunload', saveScrollOnUnload);
            document.removeEventListener('DOMContentLoaded', restoreScrollOnLoad);
            clearInterval(scrollSaveInterval);
        };
    }, []);
    
    // Global scroll preservation - prevent unwanted scroll to top
    useEffect(() => {
        let savedScrollPosition = window.scrollY || window.pageYOffset;
        let isUserScrolling = false;
        
        // Save scroll position periodically
        const saveScroll = () => {
            if (!isUserScrolling) {
                savedScrollPosition = window.scrollY || window.pageYOffset;
            }
        };
        
        // Monitor scroll events
        const handleScroll = () => {
            isUserScrolling = true;
            savedScrollPosition = window.scrollY || window.pageYOffset;
            setTimeout(() => {
                isUserScrolling = false;
            }, 100);
        };
        
        // Prevent scroll to top on focus/click events - AGGRESSIVE VERSION
        const preventScrollToTop = (e) => {
            // Check if the event is on a text input/textarea
            const target = e.target;
            if (!target || typeof target !== 'object') return;
            
            // Check if target is a DOM element
            const isTextInput = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT';
            const isContentEditable = target.contentEditable === 'true';
            const hasContentEditableParent = target.closest && typeof target.closest === 'function' && target.closest('[contenteditable="true"]');
            
            if (isTextInput || isContentEditable || hasContentEditableParent) {
                // Save current scroll position IMMEDIATELY
                savedScrollPosition = window.scrollY || window.pageYOffset;
                
                // IMMEDIATE restoration - don't wait
                if (savedScrollPosition > 0) {
                    window.scrollTo(0, savedScrollPosition);
                }
                
                // Aggressive restoration with multiple attempts
                requestAnimationFrame(() => {
                    if (savedScrollPosition > 0) {
                        window.scrollTo(0, savedScrollPosition);
                    }
                });
                setTimeout(() => {
                    if (savedScrollPosition > 0) {
                        window.scrollTo(0, savedScrollPosition);
                    }
                }, 0);
                setTimeout(() => {
                    if (savedScrollPosition > 0) {
                        window.scrollTo(0, savedScrollPosition);
                    }
                }, 10);
                setTimeout(() => {
                    if (savedScrollPosition > 0) {
                        window.scrollTo(0, savedScrollPosition);
                    }
                }, 50);
                setTimeout(() => {
                    if (savedScrollPosition > 0) {
                        window.scrollTo(0, savedScrollPosition);
                    }
                }, 100);
                setTimeout(() => {
                    if (savedScrollPosition > 0) {
                        window.scrollTo(0, savedScrollPosition);
                    }
                }, 200);
            }
        };
        
        // Also prevent on mousedown
        const preventScrollOnMouseDown = (e) => {
            const target = e.target;
            if (!target || typeof target !== 'object') return;
            
            const isTextInput = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT';
            const isContentEditable = target.contentEditable === 'true';
            const hasContentEditableParent = target.closest && typeof target.closest === 'function' && target.closest('[contenteditable="true"]');
            
            if (isTextInput || isContentEditable || hasContentEditableParent) {
                savedScrollPosition = window.scrollY || window.pageYOffset;
                if (savedScrollPosition > 0) {
                    window.scrollTo(0, savedScrollPosition);
                }
            }
        };
        
        window.addEventListener('scroll', handleScroll, { passive: true });
        window.addEventListener('focus', preventScrollToTop, true);
        window.addEventListener('click', preventScrollToTop, true);
        window.addEventListener('mousedown', preventScrollOnMouseDown, true);
        
        // Save scroll position more frequently
        const scrollInterval = setInterval(saveScroll, 50);
        
        // Also monitor scroll position continuously for contentEditable elements
        const scrollMonitor = setInterval(() => {
            const activeElement = document.activeElement;
            if (activeElement && (activeElement.contentEditable === 'true' || 
                activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT')) {
                const currentScroll = window.scrollY || window.pageYOffset;
                if (currentScroll === 0 && savedScrollPosition > 0) {
                    // Scroll was reset to 0, restore it
                    window.scrollTo(0, savedScrollPosition);
                } else if (currentScroll > 0) {
                    // Update saved position
                    savedScrollPosition = currentScroll;
                }
            }
        }, 50);
        
        return () => {
            window.removeEventListener('scroll', handleScroll);
            window.removeEventListener('focus', preventScrollToTop, true);
            window.removeEventListener('click', preventScrollToTop, true);
            window.removeEventListener('mousedown', preventScrollOnMouseDown, true);
            clearInterval(scrollInterval);
            clearInterval(scrollMonitor);
        };
    }, []);

    const [monthlyNotesList, setMonthlyNotesList] = useState([]);
    const [currentMonthlyNotes, setCurrentMonthlyNotes] = useState(null);
    const [scrollRestoreTrigger, setScrollRestoreTrigger] = useState(0);
    
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
    const [saving, setSaving] = useState(false); // Separate state for save operations
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
    
    // Save status removed - saves happen silently in background
    
    // Removed: isBlockingNavigation - no longer needed since we don't auto-save

    // No change tracking - values are saved directly from form fields when Save button is clicked

    const weekCardRefs = useRef({});
    
    // Ref to store scroll position that needs to be preserved after state updates
    const preservedScrollPosition = useRef(null);
    
    // Effect to restore scroll position after state updates
    useEffect(() => {
        if (preservedScrollPosition.current !== null) {
            const scrollY = preservedScrollPosition.current;
            console.log('🔄 Restoring scroll position:', scrollY);
            
            // Helper to check if scroll is restored and clear if so
            const checkAndClear = () => {
                const currentScroll = window.scrollY || window.pageYOffset;
                // If scroll is within 5px of target, consider it restored
                if (Math.abs(currentScroll - scrollY) < 5) {
                    console.log('✅ Scroll position restored successfully:', currentScroll);
                    preservedScrollPosition.current = null;
                    return true;
                }
                return false;
            };
            
            // Aggressive restoration with multiple attempts using instant behavior
            // Immediate restoration
            window.scrollTo({ top: scrollY, behavior: 'instant' });
            if (checkAndClear()) return;
            
            // Restore after next paint
            requestAnimationFrame(() => {
                window.scrollTo({ top: scrollY, behavior: 'instant' });
                if (checkAndClear()) return;
            });
            
            // Restore after a short delay (for async state updates)
            setTimeout(() => {
                window.scrollTo({ top: scrollY, behavior: 'instant' });
                if (checkAndClear()) return;
            }, 0);
            
            // Restore after a longer delay (for DOM updates)
            setTimeout(() => {
                window.scrollTo({ top: scrollY, behavior: 'instant' });
                if (checkAndClear()) return;
            }, 10);
            
            // Restore after React has finished rendering
            setTimeout(() => {
                window.scrollTo({ top: scrollY, behavior: 'instant' });
                if (checkAndClear()) return;
            }, 50);
            
            // Restore after more time for delayed state updates
            setTimeout(() => {
                window.scrollTo({ top: scrollY, behavior: 'instant' });
                if (checkAndClear()) return;
            }, 100);
            
            // Additional restoration attempts for stubborn cases
            setTimeout(() => {
                window.scrollTo({ top: scrollY, behavior: 'instant' });
                if (checkAndClear()) return;
            }, 200);
            
            setTimeout(() => {
                window.scrollTo({ top: scrollY, behavior: 'instant' });
                if (checkAndClear()) return;
            }, 300);
            
            // Final restoration attempt - clear after this regardless
            setTimeout(() => {
                window.scrollTo({ top: scrollY, behavior: 'instant' });
                preservedScrollPosition.current = null;
            }, 500);
        }
    }, [currentMonthlyNotes, monthlyNotesList, loading, scrollRestoreTrigger]);
    
    const reloadMonthlyNotes = useCallback(async (preferredMonthKey = null, preserveScroll = false) => {
        // Preserve scroll position if requested
        const currentScrollPosition = preserveScroll ? (window.scrollY || window.pageYOffset) : null;
        
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
                // Restore scroll position if preserved
                if (preserveScroll && currentScrollPosition !== null) {
                    requestAnimationFrame(() => {
                        window.scrollTo(0, currentScrollPosition);
                    });
                }
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
            
            // Restore scroll position after state updates if preserved - AGGRESSIVE with multiple attempts
            if (preserveScroll && currentScrollPosition !== null && currentScrollPosition > 0) {
                // Immediate restoration
                window.scrollTo(0, currentScrollPosition);
                
                requestAnimationFrame(() => {
                    window.scrollTo(0, currentScrollPosition);
                });
                
                setTimeout(() => {
                    window.scrollTo(0, currentScrollPosition);
                }, 0);
                
                setTimeout(() => {
                    window.scrollTo(0, currentScrollPosition);
                }, 10);
                
                setTimeout(() => {
                    window.scrollTo(0, currentScrollPosition);
                }, 50);
                
                    setTimeout(() => {
                        window.scrollTo(0, currentScrollPosition);
                    }, 100);
                
                setTimeout(() => {
                    window.scrollTo(0, currentScrollPosition);
                }, 200);
                
                setTimeout(() => {
                    window.scrollTo(0, currentScrollPosition);
                }, 500);
            }
        } catch (error) {
            console.error('Error reloading monthly notes:', error);
            // Restore scroll position even on error if preserved
            if (preserveScroll && currentScrollPosition !== null) {
                requestAnimationFrame(() => {
                    window.scrollTo(0, currentScrollPosition);
                });
            }
            if (typeof alert === 'function') {
                console.error('Failed to refresh monthly meeting notes.');
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

    // Batched version to update multiple fields at once (prevents multiple re-renders)
    const updateDepartmentNotesLocalBatched = useCallback(
        (departmentNotesId, updates, monthlyId) => {
            const applyUpdates = (note) => {
                if (!note) {
                    return note;
                }

                const weeklyNotes = Array.isArray(note.weeklyNotes)
                    ? note.weeklyNotes.map((week) => ({
                          ...week,
                          departmentNotes: Array.isArray(week.departmentNotes)
                              ? week.departmentNotes.map((deptNote) =>
                                    deptNote?.id === departmentNotesId 
                                        ? { ...deptNote, ...updates } 
                                        : deptNote
                                )
                              : week.departmentNotes
                      }))
                    : note.weeklyNotes;
                return { ...note, weeklyNotes };
            };

            setCurrentMonthlyNotes((prev) => (prev ? applyUpdates(prev) : prev));

            if (monthlyId) {
                setMonthlyNotesList((prev) => {
                    if (!Array.isArray(prev)) {
                        return prev;
                    }
                    return prev.map((note) => (note?.id === monthlyId ? applyUpdates(note) : note));
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

    // Expose functions for parent components (no tracking - always returns false)
    const managementMeetingNotesRef = useRef({
        hasPendingSaves: () => {
            // No tracking - always return false
            return false;
        }
    });
    
    // No tracking - removed all navigation blocking and change tracking code
    // Expose ref to window for Teams component (hasPendingSaves always returns false)
    useEffect(() => {
        window.ManagementMeetingNotesRef = managementMeetingNotesRef;
        return () => {
            delete window.ManagementMeetingNotesRef;
        };
    }, []);

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
            // Invalid month - return silently
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
            // Existing notes loaded silently
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
                            // Existing notes loaded silently
                        }
                        return duplicateNotes;
                    }
                    if (typeof alert === 'function') {
                        // Monthly notes already exist - handled silently
                    }
                } catch (loadError) {
                    console.error('Failed to load existing monthly notes after duplicate warning:', loadError);
                    if (typeof alert === 'function') {
                        console.error('Monthly notes already exist but could not load automatically.');
                    }
                }
            } else if (typeof alert === 'function') {
                console.error('Failed to create monthly notes');
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
            // Existing notes loaded silently
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
                            // Existing notes loaded silently
                        }
                    } else if (typeof alert === 'function') {
                        // Monthly notes already exist - handled silently
                    }
                } catch (loadError) {
                    console.error('Failed to load existing monthly notes after duplicate warning:', loadError);
                    if (typeof alert === 'function') {
                        console.error('Monthly notes already exist but could not load automatically.');
                    }
                }
            } else {
                if (typeof alert === 'function') {
                    console.error('Failed to generate monthly plan');
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
                console.error('Failed to delete monthly meeting notes.');
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
                console.error('Failed to delete all meeting notes.');
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
                console.error('Failed to delete weekly notes.');
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
                // Invalid week date - return silently
            }
            return null;
        }

        if (!weekDetails) {
            weekDetails = deriveWeekDetails(new Date());
        }

        if (!weekDetails) {
            if (typeof alert === 'function') {
                // Unable to determine week - return silently
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
                // Existing weekly notes loaded silently
            }
            return existingWeek;
        }

        try {
            setLoading(true);
            const monthId = targetMonth?.id;
            if (!monthId) {
                if (typeof alert === 'function') {
                    console.error('Unable to locate monthly notes for the selected week.');
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
                        // Existing weekly notes loaded silently
                    }
                } catch (loadError) {
                    console.error('Failed to reload monthly notes after duplicate weekly warning:', loadError);
                    if (typeof alert === 'function') {
                        console.error('Weekly notes already exist but could not load automatically.');
                    }
                }
            } else if (typeof alert === 'function') {
                console.error('Failed to create weekly notes');
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
        
        // Preserve scroll position to prevent navigation to top
        const currentScrollPosition = window.scrollY || window.pageYOffset;
        
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
            
            // Restore scroll position after state updates
            requestAnimationFrame(() => {
                window.scrollTo(0, currentScrollPosition);
            });
        } catch (error) {
            console.error('Error updating department notes:', error);
            
            // Restore scroll position even on error
            requestAnimationFrame(() => {
                window.scrollTo(0, currentScrollPosition);
            });
            
            // Error logged silently - no popup messages
            console.error('Failed to update department notes.');
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
            // Error logged silently - no popup messages
            if (selectedMonth) {
                await reloadMonthlyNotes(selectedMonth);
            }
        }
    };

    // Save status refs removed - saves happen silently in background
    
    // Track the last saved value per field to avoid duplicate saves
    const lastSavedValues = useRef({});
    
    // Track current field values for UI responsiveness
    const currentFieldValues = useRef({});
    
    // Track pending values for unsaved changes
    const pendingValues = useRef({});
    
    // Debounce timer refs for field changes
    const fieldChangeDebounceTimers = useRef({});
    const DEBOUNCE_DELAY = 300; // 300ms debounce delay
    
    // Track field changes - NO auto-save, only updates local state
    // Debounced to prevent excessive updates on every keystroke
    const handleFieldChange = (departmentNotesId, field, value) => {
        // Update local state immediately for responsive UI (no debounce on UI updates)
        const monthlyId = currentMonthlyNotes?.id || null;
        updateDepartmentNotesLocal(departmentNotesId, field, value, monthlyId);
        
        const fieldKey = getFieldKey(departmentNotesId, field);
        
        // Update currentFieldValues immediately (for UI responsiveness)
        // Use try-catch to handle cases where currentFieldValues might not be in scope (e.g., bundling issues)
        try {
            currentFieldValues.current[fieldKey] = value;
        } catch (error) {
            // If currentFieldValues is not accessible (ReferenceError), log warning but don't break the UI
            // This can happen due to bundling/minification scoping issues
            if (error instanceof ReferenceError && error.message.includes('currentFieldValues')) {
                console.warn('currentFieldValues not accessible in handleFieldChange (likely a bundling scoping issue):', error.message);
            } else {
                // Re-throw if it's a different error
                throw error;
            }
        }
        
        // Debounce the pendingValues update to reduce excessive save checks
        // Clear existing timer for this field
        if (fieldChangeDebounceTimers.current[fieldKey]) {
            clearTimeout(fieldChangeDebounceTimers.current[fieldKey]);
        }
        
        // Set new timer to update pendingValues after user stops typing
        fieldChangeDebounceTimers.current[fieldKey] = setTimeout(() => {
            // Store the latest value for tracking unsaved changes
            pendingValues.current[fieldKey] = { departmentNotesId, field, value };
            // Clean up timer reference
            delete fieldChangeDebounceTimers.current[fieldKey];
        }, DEBOUNCE_DELAY);
        
        // NO AUTO-SAVE - changes are only saved when Save button is clicked
    };
    
    // Update field value on blur (just updates local state)
    const handleFieldBlur = (departmentNotesId, field, value) => {
        // Update local state with the value
        const monthlyId = currentMonthlyNotes?.id || null;
        updateDepartmentNotesLocal(departmentNotesId, field, value, monthlyId);
        // No tracking, no auto-save - only saved when Save button is clicked
    };

    // Save all fields for a department at once
    const handleSaveDepartment = async (departmentNotesId, event = null) => {
        console.log('💾 handleSaveDepartment called:', { departmentNotesId, hasEvent: !!event });
        
        if (!departmentNotesId) {
            console.error('❌ No departmentNotesId provided');
            return;
        }
        
        // Preserve scroll position to prevent navigation to top
        const currentScrollPosition = window.scrollY || window.pageYOffset;
        preservedScrollPosition.current = currentScrollPosition;
        console.log('💾 Preserving scroll position before save:', currentScrollPosition);
        // Trigger scroll restoration effect
        setScrollRestoreTrigger(prev => prev + 1);
        
        // Find the department note
        const week = currentMonthlyNotes?.weeklyNotes?.find(w => 
            w.departmentNotes?.some(dn => dn.id === departmentNotesId)
        );
        if (!week) {
            console.error('Week not found for departmentNotesId:', departmentNotesId);
            return;
        }
        
        const deptNote = week.departmentNotes?.find(dn => dn.id === departmentNotesId);
        if (!deptNote) {
            console.error('Department note not found:', departmentNotesId);
            return;
        }
        
        // CRITICAL: Get field values directly from DOM (RichTextEditor contentEditable divs)
        // This ensures we capture the latest content even if React state hasn't updated yet
        // Strategy: Find the Save button that was clicked, traverse up to find department section,
        // then find all contentEditable divs in order (successes, weekToFollow, frustrations)
        
        // Get the event target (Save button) - prefer event.target if provided
        let saveButtonElement = null;
        try {
            // First try to use the event target if provided
            if (event && event.target) {
                // Find the button element (might be the icon or text node)
                saveButtonElement = event.target.closest('button');
            }
            
            // If not found, try to get the active element
            if (!saveButtonElement) {
                saveButtonElement = document.activeElement;
                // Verify it's actually a button
                if (saveButtonElement && saveButtonElement.tagName !== 'BUTTON') {
                    saveButtonElement = null;
                }
            }
            
            // If still not found, find all Save buttons and match by context
            if (!saveButtonElement || !saveButtonElement.textContent?.includes('Save')) {
                // Find buttons with "Save" text (not just "Save Department")
                const allSaveButtons = Array.from(document.querySelectorAll('button')).filter(btn => {
                    const text = btn.textContent || '';
                    return text.includes('Save') && !text.includes('Save All');
                });
                
                // Try to find the one in the same department section by traversing from department note data attributes
                // Find textareas with matching department note ID to locate the right section
                const deptTextarea = document.querySelector(`textarea[data-dept-note-id="${departmentNotesId}"]`);
                if (deptTextarea && allSaveButtons.length > 0) {
                    // Find the Save button closest to this textarea
                    const deptSection = deptTextarea.closest('[class*="rounded"], [class*="space-y"]');
                    if (deptSection) {
                        const sectionSaveButton = deptSection.querySelector('button');
                        if (sectionSaveButton && sectionSaveButton.textContent?.includes('Save')) {
                            saveButtonElement = sectionSaveButton;
                        }
                    }
                }
                
                // Fallback to first Save button if still not found
                if (!saveButtonElement && allSaveButtons.length > 0) {
                    saveButtonElement = allSaveButtons[0];
                }
            }
        } catch (e) {
            console.warn('Could not find save button element:', e);
        }
        
        const getCurrentFieldValue = (fieldName) => {
            // Strategy 1: Use React state first (updated immediately by handleFieldChange) - most reliable
            const stateValue = deptNote[fieldName] || '';
            
            // Strategy 2: Try to get from DOM contentEditable (for RichTextEditor)
            // Find department section by traversing from Save button
            let departmentSection = null;
            
            if (saveButtonElement) {
                // Traverse up to find the department container
                let current = saveButtonElement.parentElement;
                let depth = 0;
                while (current && depth < 15) {
                    // Look for contentEditable divs or textareas with our department note ID
                    const hasContentEditable = current.querySelectorAll('[contenteditable="true"]').length >= 3;
                    const hasDeptTextarea = current.querySelector(`textarea[data-dept-note-id="${departmentNotesId}"]`);
                    
                    if (hasContentEditable || hasDeptTextarea) {
                        departmentSection = current;
                        break;
                    }
                    current = current.parentElement;
                    depth++;
                }
            }
            
            // Strategy 3: Find by textarea with department note ID
            if (!departmentSection) {
                const anyDeptTextarea = document.querySelector(`textarea[data-dept-note-id="${departmentNotesId}"]`);
                if (anyDeptTextarea) {
                    departmentSection = anyDeptTextarea.closest('[class*="space-y"], [class*="rounded"], div');
                }
            }
            
            // Strategy 4: If we found the department section, try to get value from DOM
            if (departmentSection) {
                // Try to find by data-field attribute first
                const fieldByAttribute = departmentSection.querySelector(`[data-field="${fieldName}"]`);
                if (fieldByAttribute) {
                    if (fieldByAttribute.tagName === 'TEXTAREA' && fieldByAttribute.value !== undefined) {
                        const domValue = fieldByAttribute.value;
                        // Use DOM value if it's different (more recent) than state
                        if (domValue !== stateValue) {
                            console.log(`📝 Using DOM value for ${fieldName} (more recent than state)`);
                            return domValue;
                        }
                    }
                    if (fieldByAttribute.contentEditable === 'true' && fieldByAttribute.innerHTML !== undefined) {
                        const domValue = fieldByAttribute.innerHTML;
                        // Clean empty HTML
                        if (domValue && domValue.trim() && domValue !== '<br>' && domValue !== '<div><br></div>') {
                            if (domValue !== stateValue) {
                                console.log(`📝 Using DOM value for ${fieldName} (more recent than state)`);
                                return domValue;
                            }
                        }
                    }
                }
                
                // Find all contentEditable divs in this section
                const editors = Array.from(departmentSection.querySelectorAll('[contenteditable="true"]'));
                
                // Match by field order: successes (0), weekToFollow (1), frustrations (2)
                const fieldIndex = fieldName === 'successes' ? 0 : 
                                  fieldName === 'weekToFollow' ? 1 : 
                                  fieldName === 'frustrations' ? 2 : -1;
                
                if (fieldIndex >= 0 && editors[fieldIndex] && editors[fieldIndex].innerHTML !== undefined) {
                    const html = editors[fieldIndex].innerHTML;
                    // Return if it's not just a placeholder or whitespace
                    if (html && html.trim() && html !== '<br>' && html !== '<div><br></div>') {
                        if (html !== stateValue) {
                            console.log(`📝 Using DOM contentEditable value for ${fieldName} (more recent than state)`);
                            return html;
                        }
                    }
                }
                
                // Also try textareas in order
                const textareas = Array.from(departmentSection.querySelectorAll(`textarea[data-dept-note-id="${departmentNotesId}"]`));
                if (fieldIndex >= 0 && textareas[fieldIndex] && textareas[fieldIndex].value !== undefined) {
                    const domValue = textareas[fieldIndex].value;
                    if (domValue !== stateValue) {
                        console.log(`📝 Using DOM textarea value for ${fieldName} (more recent than state)`);
                        return domValue;
                    }
                }
            }
            
            // Strategy 5: Fallback to React state (should be up-to-date from handleFieldChange)
            return stateValue;
        };
        
        // Get current values - prefer React state (updated immediately), fallback to DOM
        const fieldsToSave = {
            successes: getCurrentFieldValue('successes'),
            weekToFollow: getCurrentFieldValue('weekToFollow'),
            frustrations: getCurrentFieldValue('frustrations')
        };
        
        console.log('💾 Captured field values for save:', { 
            departmentNotesId, 
            fieldsToSave,
            stateValues: {
            successes: deptNote.successes || '',
            weekToFollow: deptNote.weekToFollow || '',
            frustrations: deptNote.frustrations || ''
            }
        });
        
        try {
            setSaving(true); // Use saving state instead of loading to prevent "Loading meeting notes..." from showing
            console.log('💾 Saving department notes to DB:', { departmentNotesId, fieldsToSave });
            
            // CRITICAL: Save any unsaved action items for this department before saving department notes
            // Action items with temp IDs (starting with "temp-") haven't been saved yet
            const unsavedActionItems = (deptNote.actionItems || []).filter(item => 
                item.id && typeof item.id === 'string' && item.id.startsWith('temp-')
            );
            
            if (unsavedActionItems.length > 0) {
                console.log(`💾 Saving ${unsavedActionItems.length} unsaved action items before department save...`);
                // Save each unsaved action item
                for (const actionItem of unsavedActionItems) {
                    try {
                        // Prepare action item data for saving (remove temp ID)
                        const actionItemData = {
                            ...actionItem,
                            departmentNotesId: departmentNotesId,
                            monthlyNotesId: currentMonthlyNotes?.id || null,
                            weeklyNotesId: week.id || null
                        };
                        // Remove the temp ID - server will assign a real ID
                        delete actionItemData.id;
                        
                        const response = await window.DatabaseAPI.createActionItem(actionItemData);
                        const savedActionItem = response?.data?.actionItem || response?.actionItem;
                        
                        if (savedActionItem) {
                            // Track temp ID mapping
                            if (actionItem.id) {
                                tempActionItemIds.current[actionItem.id] = savedActionItem.id;
                            }
                            // Update local state with real ID
                            updateActionItemLocal(savedActionItem, false, actionItem.id);
                            console.log(`✅ Saved action item: ${actionItem.title}`);
                        }
                    } catch (error) {
                        console.error(`❌ Error saving action item "${actionItem.title}":`, error);
                        // Continue saving other action items even if one fails
                    }
                }
            }
            
            // Validate that we have a valid departmentNotesId
            if (!departmentNotesId || typeof departmentNotesId !== 'string') {
                throw new Error('Invalid department notes ID');
            }
            
            // Validate that DatabaseAPI is available
            if (!window.DatabaseAPI || typeof window.DatabaseAPI.updateDepartmentNotes !== 'function') {
                throw new Error('Database API is not available. Please refresh the page.');
            }
            
            // Save to database
            console.log('💾 Calling updateDepartmentNotes with:', { departmentNotesId, fieldsToSave });
            const response = await window.DatabaseAPI.updateDepartmentNotes(departmentNotesId, fieldsToSave);
            
            if (!response) {
                throw new Error('No response from database API');
            }
            
            // Check if response indicates an error
            if (response.error || response.message) {
                const errorMsg = response.error || response.message;
                if (errorMsg.toLowerCase().includes('error') || errorMsg.toLowerCase().includes('fail')) {
                    throw new Error(errorMsg);
                }
            }
            
            console.log('✅ Successfully saved to database:', response);
            
            // Update local state immediately with saved values (NO PAGE REFRESH, NO RELOAD)
            // This ensures the saved data appears on screen right away without any reload
            const monthlyId = currentMonthlyNotes?.id || null;
            
            // CRITICAL: Use batched update to prevent multiple re-renders that cause scroll jumps
            // Update all three fields in a single state update instead of three separate updates
            // This prevents the page from jumping to top after save
            updateDepartmentNotesLocalBatched(
                departmentNotesId,
                {
                    successes: fieldsToSave.successes,
                    weekToFollow: fieldsToSave.weekToFollow,
                    frustrations: fieldsToSave.frustrations
                },
                monthlyId
            );
            
            // No notifications - save happens silently
            
            // CRITICAL: Restore scroll position IMMEDIATELY after batched state update
            // Use synchronous scroll restoration to prevent any jump
            if (preservedScrollPosition.current !== null) {
                const scrollY = preservedScrollPosition.current;
                
                // Immediate synchronous restoration (before React re-renders)
                window.scrollTo({ top: scrollY, behavior: 'instant' });
                
                // Additional restoration attempts to handle any async DOM updates
                requestAnimationFrame(() => {
                    window.scrollTo({ top: scrollY, behavior: 'instant' });
                });
                
                setTimeout(() => {
                    window.scrollTo({ top: scrollY, behavior: 'instant' });
                }, 0);
                
                setTimeout(() => {
                    window.scrollTo({ top: scrollY, behavior: 'instant' });
                }, 10);
                
                setTimeout(() => {
                    window.scrollTo({ top: scrollY, behavior: 'instant' });
                }, 50);
            }
            
            // DO NOT RELOAD - Just update local state and continue
            // No reloadMonthlyNotes call - data is already updated locally
            
        } catch (error) {
            console.error('❌ Error saving department notes:', error);
            
            // Scroll position is preserved via preservedScrollPosition ref and useEffect
            // No need for manual restoration here - useEffect will handle it
            
            // Error logged silently - no popup messages
        } finally {
            setSaving(false); // Use saving state instead of loading
        }
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
            // Prevent any default behavior and preserve scroll position
            const currentScrollPosition = window.scrollY || window.pageYOffset;
            preservedScrollPosition.current = currentScrollPosition;
            console.log('💾 Preserving scroll position before action item save:', currentScrollPosition);
            // Trigger scroll restoration effect
            setScrollRestoreTrigger(prev => prev + 1);
            
            // Validate required fields
            if (!actionItemData.title || !actionItemData.title.trim()) {
                // Title required - validation handled silently
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
            
            // Scroll position is preserved via preservedScrollPosition ref and useEffect
            // No need for manual restoration here - useEffect will handle it

            setSaving(true); // Use saving state instead of loading to prevent "Loading meeting notes..." from showing

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
                
                // Aggressively restore scroll position after state update
                if (preservedScrollPosition.current !== null) {
                    const scrollY = preservedScrollPosition.current;
                    requestAnimationFrame(() => {
                        window.scrollTo({ top: scrollY, behavior: 'instant' });
                    });
                    setTimeout(() => {
                        window.scrollTo({ top: scrollY, behavior: 'instant' });
                    }, 0);
                    setTimeout(() => {
                        window.scrollTo({ top: scrollY, behavior: 'instant' });
                    }, 10);
                    setTimeout(() => {
                        window.scrollTo({ top: scrollY, behavior: 'instant' });
                    }, 50);
                }
                
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
            console.error('Failed to save action item:', error.message || 'Unknown error');
        } finally {
            setSaving(false); // Use saving state instead of loading
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
        
        // Preserve scroll position to prevent navigation to top
        const currentScrollPosition = window.scrollY || window.pageYOffset;
        preservedScrollPosition.current = currentScrollPosition;
        console.log('💾 Preserving scroll position before action item delete:', currentScrollPosition);
        // Trigger scroll restoration effect
        setScrollRestoreTrigger(prev => prev + 1);
        
        // Store previous state for rollback
        const previousNotes = currentMonthlyNotes;
        
        // Optimistic update - remove immediately
        deleteActionItemLocal(id);
        
        try {
            setSaving(true); // Use saving state instead of loading to prevent "Loading meeting notes..." from showing
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
            console.error('Failed to delete action item');
        } finally {
            setSaving(false); // Use saving state instead of loading
            
            // Restore scroll position after delete
            if (preservedScrollPosition.current !== null) {
                const scrollY = preservedScrollPosition.current;
                requestAnimationFrame(() => {
                    window.scrollTo({ top: scrollY, behavior: 'instant' });
                });
                setTimeout(() => {
                    window.scrollTo({ top: scrollY, behavior: 'instant' });
                }, 0);
                setTimeout(() => {
                    window.scrollTo({ top: scrollY, behavior: 'instant' });
                }, 10);
                setTimeout(() => {
                    window.scrollTo({ top: scrollY, behavior: 'instant' });
                }, 50);
            }
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
        
        // Prevent any default behavior
        const currentScrollPosition = window.scrollY || window.pageYOffset;
        preservedScrollPosition.current = currentScrollPosition;
        console.log('💾 Preserving scroll position before comment save:', currentScrollPosition);
        // Trigger scroll restoration effect
        setScrollRestoreTrigger(prev => prev + 1);
        
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
        
        // Scroll position is preserved via preservedScrollPosition ref and useEffect
        // No need for manual restoration here - useEffect will handle it
        
        try {
            setSaving(true); // Use saving state instead of loading to prevent "Loading meeting notes..." from showing
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
                
                // Aggressively restore scroll position after state update
                if (preservedScrollPosition.current !== null) {
                    const scrollY = preservedScrollPosition.current;
                    requestAnimationFrame(() => {
                        window.scrollTo({ top: scrollY, behavior: 'instant' });
                    });
                    setTimeout(() => {
                        window.scrollTo({ top: scrollY, behavior: 'instant' });
                    }, 0);
                    setTimeout(() => {
                        window.scrollTo({ top: scrollY, behavior: 'instant' });
                    }, 10);
                    setTimeout(() => {
                        window.scrollTo({ top: scrollY, behavior: 'instant' });
                    }, 50);
                }
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
            console.error('Failed to create comment');
        } finally {
            setSaving(false); // Use saving state instead of loading
        }
    };

    // Delete comment
    const handleDeleteComment = async (commentId) => {
        if (!commentId) return;
        if (!confirm('Are you sure you want to delete this comment?')) return;

        // Preserve scroll position to prevent navigation to top
        const currentScrollPosition = window.scrollY || window.pageYOffset;
        preservedScrollPosition.current = currentScrollPosition;
        console.log('💾 Preserving scroll position before comment delete:', currentScrollPosition);
        // Trigger scroll restoration effect
        setScrollRestoreTrigger(prev => prev + 1);

        // Store previous state for rollback
        const previousNotes = currentMonthlyNotes;
        
        // Optimistic update - remove immediately
        deleteCommentLocal(commentId);
        
        try {
            setSaving(true); // Use saving state instead of loading to prevent "Loading meeting notes..." from showing
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
            console.error('Failed to delete comment:', error.message || 'Unknown error');
        } finally {
            setSaving(false); // Use saving state instead of loading
            
            // Restore scroll position after delete
            if (preservedScrollPosition.current !== null) {
                const scrollY = preservedScrollPosition.current;
                requestAnimationFrame(() => {
                    window.scrollTo({ top: scrollY, behavior: 'instant' });
                });
                setTimeout(() => {
                    window.scrollTo({ top: scrollY, behavior: 'instant' });
                }, 0);
                setTimeout(() => {
                    window.scrollTo({ top: scrollY, behavior: 'instant' });
                }, 10);
                setTimeout(() => {
                    window.scrollTo({ top: scrollY, behavior: 'instant' });
                }, 50);
            }
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
            console.error('Failed to update allocation');
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
            console.error('Failed to delete allocation');
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

    // Only show "Loading meeting notes..." during initial load, not during save operations
    if (!isReady || (loading && !saving)) {
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
            {/* Navigation blocking happens silently - no messages shown */}
            
            {/* Header */}
            <div className={`rounded-xl border p-4 ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200 shadow-sm'}`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className={`text-xl font-bold mb-1 ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                                <i className="fas fa-clipboard-list mr-2 text-primary-600"></i>
                                Management Meeting Notes
                            </h2>
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
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleCreateMonth();
                                }}
                                className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition shadow-sm hover:shadow-md font-medium"
                            >
                                <i className="fas fa-plus mr-1.5"></i>
                                Create Month
                            </button>
                        </div>
                        <button
