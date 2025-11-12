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
    const monthKey = getMonthKeyFromDate(weekStart);

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
    const [selectedMonth, setSelectedMonth] = useState(null);
    const [selectedWeek, setSelectedWeek] = useState(null);
    const [selectedDepartment, setSelectedDepartment] = useState(null);
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

    // Initialize selected month to current month
    useEffect(() => {
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        setSelectedMonth(monthKey);
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

    const nextActiveWeekId = useMemo(() => {
        if (!Array.isArray(weeks) || weeks.length === 0 || resolvedSelectedWeekIndex < 0) {
            return null;
        }
        const nextWeek = weeks[resolvedSelectedWeekIndex + 1];
        if (!nextWeek) {
            return null;
        }
        const rawIdentifier = getWeekIdentifier(nextWeek);
        return rawIdentifier || `week-${resolvedSelectedWeekIndex + 1}`;
    }, [weeks, resolvedSelectedWeekIndex]);

    useEffect(() => {
        if (!Array.isArray(weeks) || weeks.length === 0) {
            if (selectedWeek !== null) {
                setSelectedWeek(null);
            }
            return;
        }

        const hasSelectedWeek = weeks.some((week, index) => {
            const identifier = getWeekIdentifier(week) || `week-${index}`;
            return identifier === selectedWeek;
        });
        if (hasSelectedWeek && selectedWeek) {
            return;
        }

        const today = new Date();
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
        const fallbackId = getWeekIdentifier(fallbackWeek) || (fallbackIndex >= 0 ? `week-${fallbackIndex}` : '');
        if (fallbackId && fallbackId !== selectedWeek) {
            setSelectedWeek(fallbackId);
        }
    }, [weeks, selectedWeek]);

    useEffect(() => {
        if (!selectedWeek) {
            return;
        }
        const refs = weekCardRefs.current || {};
        const node = refs[selectedWeek];
        if (node && typeof node.scrollIntoView === 'function') {
            try {
                node.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                    inline: 'center'
                });
            } catch (error) {
                // Ignore scroll errors (non-DOM environments, etc.)
            }
        }
    }, [selectedWeek, weeks]);

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
        if (!confirm('Delete this week and all associated department notes, action items, and comments? This cannot be undone.')) {
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
                alert('Weekly notes already exist for this week. Loaded the existing notes instead.');
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
                        alert('Weekly notes already exist for this week. Loaded the existing notes instead.');
                    }
                } catch (loadError) {
                    console.error('Failed to reload monthly notes after duplicate weekly warning:', loadError);
                    if (typeof alert === 'function') {
                        alert('Weekly notes already exist for this week, but we could not load them automatically. Please refresh and try again.');
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

    // Update department notes
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

    // Create/Update action item
    const handleSaveActionItem = async (actionItemData) => {
        try {
            setLoading(true);
            let response;
            if (editingActionItem) {
                response = await window.DatabaseAPI.updateActionItem(editingActionItem.id, actionItemData);
            } else {
                response = await window.DatabaseAPI.createActionItem(actionItemData);
            }
            
            if (response.data?.actionItem) {
                // Reload current month's notes
                const monthResponse = await window.DatabaseAPI.getMeetingNotes(selectedMonth);
                setCurrentMonthlyNotes(monthResponse.data?.monthlyNotes);
                setShowActionItemModal(false);
                setEditingActionItem(null);
            }
        } catch (error) {
            console.error('Error saving action item:', error);
            alert('Failed to save action item');
        } finally {
            setLoading(false);
        }
    };

    // Delete action item
    const handleDeleteActionItem = async (id) => {
        if (!confirm('Are you sure you want to delete this action item?')) return;
        
        try {
            setLoading(true);
            await window.DatabaseAPI.deleteActionItem(id);
            // Reload current month's notes
            const monthResponse = await window.DatabaseAPI.getMeetingNotes(selectedMonth);
            setCurrentMonthlyNotes(monthResponse.data?.monthlyNotes);
        } catch (error) {
            console.error('Error deleting action item:', error);
            alert('Failed to delete action item');
        } finally {
            setLoading(false);
        }
    };

    // Create comment
    const handleCreateComment = async (content) => {
        if (!commentContext) return;
        
        try {
            setLoading(true);
            const commentData = {
                content,
                [commentContext.type === 'monthly' ? 'monthlyNotesId' : 
                  commentContext.type === 'department' ? 'departmentNotesId' : 
                  'actionItemId']: commentContext.id
            };
            
            await window.DatabaseAPI.createComment(commentData);
            
            // Reload current month's notes
            const monthResponse = await window.DatabaseAPI.getMeetingNotes(selectedMonth);
            setCurrentMonthlyNotes(monthResponse.data?.monthlyNotes);
            setShowCommentModal(false);
            setCommentContext(null);
        } catch (error) {
            console.error('Error creating comment:', error);
            alert('Failed to create comment');
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
        <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className={`text-lg font-semibold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>Management Meeting Notes</h2>
                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Weekly department updates and action tracking</p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                    <select
                        value={selectedMonth || ''}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className={`px-3 py-1.5 text-xs border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300'}`}
                    >
                        <option value="">Select Month...</option>
                        {availableMonths.map(month => (
                            <option key={month} value={month}>{formatMonth(month)}</option>
                        ))}
                    </select>
                    <div className="flex items-center gap-1">
                        <input
                            value={newMonthKey}
                            onChange={(e) => setNewMonthKey(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleCreateMonth(e.currentTarget.value);
                                }
                            }}
                            placeholder="YYYY-MM"
                            aria-label="Create month key"
                            title="Enter a month (YYYY-MM) to create meeting notes ahead of time"
                            className={`w-28 px-3 py-1.5 text-xs border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`}
                        />
                        <button
                            onClick={() => handleCreateMonth()}
                            className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
                        >
                            <i className="fas fa-plus mr-1"></i>
                            Create Month
                        </button>
                    </div>
                    <button
                        onClick={handleGenerateMonth}
                        className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                        title="Generate new month from previous month"
                    >
                        <i className="fas fa-magic mr-1"></i>
                        Generate Month
                    </button>
                    {currentMonthlyNotes && (
                        <button
                            onClick={() => setShowAllocationModal(true)}
                            className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                        >
                            <i className="fas fa-users mr-1"></i>
                            Allocate Users
                        </button>
                    )}
                    {currentMonthlyNotes && (
                        <button
                            onClick={handleDeleteMonth}
                            className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                        >
                            <i className="fas fa-trash mr-1"></i>
                            Delete Month
                        </button>
                    )}
                    {monthlyNotesList.length > 0 && (
                        <button
                            onClick={handleDeleteAllMonths}
                            className="px-3 py-1.5 text-xs bg-red-700 text-white rounded-lg hover:bg-red-800 transition"
                        >
                            <i className="fas fa-exclamation-triangle mr-1"></i>
                            Delete All Months
                        </button>
                    )}
                </div>
            </div>

            {/* Month Selection Info */}
            {selectedMonth && currentMonthlyNotes && (
                <div className={`rounded-lg border p-3 ${isDark ? 'bg-blue-900/30 border-blue-700' : 'bg-blue-50 border-blue-200'}`}>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <h3 className={`text-sm font-semibold ${isDark ? 'text-blue-100' : 'text-blue-900'}`}>
                            {formatMonth(selectedMonth)}
                        </h3>
                        <div className="flex items-center gap-2">
                            <input
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
                                title="Enter a week start date (YYYY-MM-DD) to create notes ahead of time"
                                className={`w-32 px-3 py-1.5 text-xs border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`}
                            />
                            <button
                                onClick={() => handleCreateWeek()}
                                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                            >
                                <i className="fas fa-plus mr-1"></i>
                                Add Week
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Action Items Summary */}
            {selectedMonth && currentMonthlyNotes && allActionItems.length > 0 && (
                <div className={`rounded-lg border p-4 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                            <i className="fas fa-tasks mr-2 text-primary-600"></i>
                            Action Items Summary
                        </h3>
                        <button
                            onClick={() => {
                                setEditingActionItem({ monthlyNotesId: currentMonthlyNotes.id });
                                setShowActionItemModal(true);
                            }}
                            className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
                        >
                            <i className="fas fa-plus mr-1"></i>
                            Add Action Item
                        </button>
                    </div>
                    <div className="grid grid-cols-4 gap-3 mb-4">
                        <div className={`rounded-lg p-3 ${isDark ? 'bg-slate-700' : 'bg-gray-50'}`}>
                            <p className={`text-xs mb-1 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Open</p>
                            <p className={`text-2xl font-bold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{actionItemsByStatus.open.length}</p>
                        </div>
                        <div className={`rounded-lg p-3 ${isDark ? 'bg-slate-700' : 'bg-gray-50'}`}>
                            <p className={`text-xs mb-1 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>In Progress</p>
                            <p className={`text-2xl font-bold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{actionItemsByStatus.in_progress.length}</p>
                        </div>
                        <div className={`rounded-lg p-3 ${isDark ? 'bg-slate-700' : 'bg-gray-50'}`}>
                            <p className={`text-xs mb-1 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Completed</p>
                            <p className={`text-2xl font-bold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{actionItemsByStatus.completed.length}</p>
                        </div>
                        <div className={`rounded-lg p-3 ${isDark ? 'bg-slate-700' : 'bg-gray-50'}`}>
                            <p className={`text-xs mb-1 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Total</p>
                            <p className={`text-2xl font-bold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{allActionItems.length}</p>
                        </div>
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                        {allActionItems.slice(0, 10).map((item) => (
                            <div key={item.id} className={`flex items-center justify-between p-2 rounded ${isDark ? 'bg-slate-700' : 'bg-gray-50'}`}>
                                <div className="flex-1">
                                    <p className={`text-xs font-medium ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{item.title}</p>
                                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                                        {item.assignedUser ? getUserName(item.assignedUserId) : 'Unassigned'} • {item.status}
                                    </p>
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
                                    <button
                                        onClick={() => handleDeleteActionItem(item.id)}
                                        className={`p-1 ${isDark ? 'text-slate-400 hover:text-red-400' : 'text-gray-400 hover:text-red-600'}`}
                                    >
                                        <i className="fas fa-trash text-xs"></i>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Weekly Notes Section */}
            {selectedMonth && currentMonthlyNotes && weeks.length > 0 && (
                <div className="space-y-4">
                    <div className={`rounded-lg border p-3 ${isDark ? 'bg-slate-900/40 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div>
                                <p className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                    Week Navigation
                                </p>
                                <p className={`text-[11px] leading-tight ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    Focus on this week alongside next week while keeping earlier updates a swipe away. Scroll horizontally to move between weeks in the month.
                                </p>
                            </div>
                        </div>
                        <div className="overflow-x-auto -mx-1 mt-3">
                            <div className="flex gap-2 px-1 pb-1">
                                {weeks.map((week, index) => {
                                    const rawId = getWeekIdentifier(week);
                                    const identifier = rawId || `week-${index}`;
                                    const isPrimary = identifier === selectedWeek;
                                    const isNext = identifier === nextActiveWeekId;
                                    const label = isPrimary ? 'This Week' : isNext ? 'Next Week' : 'View Week';
                                    return (
                                        <button
                                            key={identifier}
                                            type="button"
                                            onClick={() => setSelectedWeek(identifier)}
                                            className={`relative whitespace-nowrap px-3 py-2 rounded-lg border text-xs font-medium transition ${
                                                isPrimary
                                                    ? isDark
                                                        ? 'bg-primary-600/20 border-primary-400 text-primary-200'
                                                        : 'bg-primary-50 border-primary-500 text-primary-700'
                                                    : isNext
                                                        ? isDark
                                                            ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                                                            : 'bg-amber-50 border-amber-400 text-amber-700'
                                                        : isDark
                                                            ? 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500 hover:text-slate-200'
                                                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-700'
                                            }`}
                                        >
                                            <span className="block text-[10px] uppercase tracking-wide">
                                                {label}
                                            </span>
                                            <span className="block text-[11px] font-semibold">
                                                {formatWeek(week.weekKey, week.weekStart)}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="overflow-x-auto pb-2">
                        <div className="flex gap-4 min-w-full">
                            {weeks.map((week, index) => {
                                const rawId = getWeekIdentifier(week);
                                const identifier = rawId || `week-${index}`;
                                const isPrimary = identifier === selectedWeek;
                                const isNext = identifier === nextActiveWeekId;
                                const departmentNotes = Array.isArray(week?.departmentNotes) ? week.departmentNotes : [];
                                const hasDepartmentNotes = departmentNotes.length > 0;
                                const isActive = isPrimary || isNext;
                                const summary = getWeekSummaryStats(week);

                                return (
                                    <div
                                        key={identifier}
                                        ref={(node) => {
                                            if (!weekCardRefs.current) {
                                                weekCardRefs.current = {};
                                            }
                                            if (node) {
                                                weekCardRefs.current[identifier] = node;
                                            } else if (weekCardRefs.current[identifier]) {
                                                delete weekCardRefs.current[identifier];
                                            }
                                        }}
                                        className={`flex-shrink-0 w-full md:w-[520px] xl:w-[560px] rounded-lg border transition-all duration-200 ${
                                            isPrimary
                                                ? isDark
                                                    ? 'border-primary-400 shadow-lg shadow-primary-900/40'
                                                    : 'border-primary-500 shadow-lg shadow-primary-200/60'
                                                : isNext
                                                    ? isDark
                                                        ? 'border-amber-400 shadow-md shadow-amber-900/30'
                                                        : 'border-amber-400 shadow-md shadow-amber-100/80'
                                                    : isDark
                                                        ? 'border-slate-700'
                                                        : 'border-gray-200'
                                        } ${!isActive ? 'opacity-90' : ''}`}
                                    >
                                        <div className={`p-4 h-full flex flex-col ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
                                            <div className="flex items-start justify-between gap-2 mb-3">
                                                <div>
                                                    <p className={`text-[11px] uppercase tracking-wide font-semibold ${isPrimary ? (isDark ? 'text-primary-300' : 'text-primary-600') : isNext ? (isDark ? 'text-amber-300' : 'text-amber-600') : isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                        {isPrimary ? 'This Week' : isNext ? 'Next Week' : 'Week Overview'}
                                                    </p>
                                <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                                    <i className="fas fa-calendar-week mr-2 text-primary-600"></i>
                                                        {formatWeek(week.weekKey, week.weekStart)}
                                </h3>
                                                </div>
                                <div className="flex items-center gap-2">
                                                    {!isPrimary && (
                                    <button
                                                            type="button"
                                                            onClick={() => setSelectedWeek(identifier)}
                                                            className={`text-[11px] px-2 py-1 rounded ${isDark ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                                                        >
                                                            Focus
                                    </button>
                                                    )}
                                    <button
                                                        type="button"
                                        onClick={() => handleDeleteWeek(week)}
                                                        className={`text-[11px] flex items-center gap-1 px-2 py-1 rounded ${isDark ? 'bg-red-900 text-red-200 hover:bg-red-800' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
                                    >
                                        <i className="fas fa-trash"></i>
                                                        Delete
                                    </button>
                                </div>
                            </div>

                                            <div className="grid grid-cols-3 gap-2 mb-4">
                                                <div className={`rounded border px-2 py-1 ${isDark ? 'border-slate-700 bg-slate-900/40 text-slate-200' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                                                    <p className="text-[10px] uppercase tracking-wide">Departments</p>
                                                    <p className="text-sm font-semibold">{summary.departmentCount}</p>
                                                </div>
                                                <div className={`rounded border px-2 py-1 ${isDark ? 'border-slate-700 bg-slate-900/40 text-slate-200' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                                                    <p className="text-[10px] uppercase tracking-wide">Action Items</p>
                                                    <p className="text-sm font-semibold">{summary.totalActionItems}</p>
                                                </div>
                                                <div className={`rounded border px-2 py-1 ${isDark ? 'border-slate-700 bg-slate-900/40 text-slate-200' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                                                    <p className="text-[10px] uppercase tracking-wide">Comments</p>
                                                    <p className="text-sm font-semibold">{summary.totalComments}</p>
                                                </div>
                                            </div>

                                            <div className="space-y-4 flex-1 overflow-y-auto">
                                                {hasDepartmentNotes ? (
                                                    DEPARTMENTS.map((dept) => {
                                                        const deptNote = week.departmentNotes?.find(
                                                            (dn) => dn.departmentId === dept.id
                                                        );

                                                        if (!deptNote) return null;

                                                        const allocations = currentMonthlyNotes.userAllocations?.filter(
                                                            (a) => a.departmentId === dept.id
                                                        ) || [];
                                                        return (
                                                            <div key={dept.id} className={`border rounded-lg p-3 ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
                                                                <div className="flex items-center justify-between mb-3">
                                                                    <h4 className={`text-sm font-semibold flex items-center gap-2 ${isDark ? `text-${dept.color}-300` : `text-${dept.color}-700`}`}>
                                                                        <i className={`fas ${dept.icon} ${isDark ? `text-${dept.color}-400` : `text-${dept.color}-600`}`}></i>
                                                                        {dept.name}
                                                                    </h4>
                                                                    <div className="flex gap-2">
                                                                        {allocations.length > 0 && (
                                                                            <div className="flex gap-1">
                                                                                {allocations.map((allocation) => (
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

                                                                <div className="space-y-3">
                                                                    {/* Successes */}
                                                                    <div>
                                                                        <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                                                                            Last Week's Successes
                                                                        </label>
                                                                        <textarea
                                                                            value={deptNote.successes ?? ''}
                                                                            onChange={(e) => handleUpdateDepartmentNotes(deptNote.id, 'successes', e.target.value)}
                                                                            placeholder="What went well this week?"
                                                                            className={`w-full min-h-[80px] p-2 text-xs border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300'}`}
                                                                        />
                                                                    </div>

                                                                    {/* Week to Follow */}
                                                                    <div>
                                                                        <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                                                                            This Week's Plan
                                                                        </label>
                                                                        <textarea
                                                                            value={deptNote.weekToFollow ?? ''}
                                                                            onChange={(e) => handleUpdateDepartmentNotes(deptNote.id, 'weekToFollow', e.target.value)}
                                                                            placeholder="What's planned for this week?"
                                                                            className={`w-full min-h-[80px] p-2 text-xs border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300'}`}
                                                                        />
                                                                    </div>

                                                                    {/* Frustrations */}
                                                                    <div>
                                                                        <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                                                                            Frustrations/Challenges
                                                                        </label>
                                                                        <textarea
                                                                            value={deptNote.frustrations ?? ''}
                                                                            onChange={(e) => handleUpdateDepartmentNotes(deptNote.id, 'frustrations', e.target.value)}
                                                                            placeholder="What challenges or blockers are we facing?"
                                                                            className={`w-full min-h-[80px] p-2 text-xs border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300'}`}
                                                                        />
                                                                    </div>

                                                                    {/* Action Items */}
                                                                    {deptNote.actionItems && deptNote.actionItems.length > 0 && (
                                                                        <div>
                                                                            <label className={`block text-xs font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                                                                                Action Items
                                                                            </label>
                                                                            <div className="space-y-2">
                                                                                {deptNote.actionItems.map((item) => (
                                                                                    <div key={item.id} className={`flex items-center justify-between p-2 rounded ${isDark ? 'bg-slate-700' : 'bg-gray-50'}`}>
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
                                                                                {deptNote.comments.map((comment) => (
                                                                                    <div key={comment.id} className={`p-2 rounded ${isDark ? 'bg-slate-700' : 'bg-gray-50'}`}>
                                                                                        <p className={`text-xs ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{comment.content}</p>
                                                                                        <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                                                                                            {comment.author ? (comment.author.name || comment.author.email) : 'Unknown'} • {new Date(comment.createdAt).toLocaleDateString()}
                                                                                        </p>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {/* Add Comment Button */}
                                                                    <button
                                                                        onClick={() => {
                                                                            setCommentContext({ type: 'department', id: deptNote.id });
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
                                                                            setEditingActionItem({ weeklyNotesId: week.id, departmentNotesId: deptNote.id });
                                                                            setShowActionItemModal(true);
                                                                        }}
                                                                        className={`w-full text-xs px-3 py-2 rounded ${isDark ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                                                                    >
                                                                        <i className="fas fa-plus mr-1"></i>
                                                                        Add Action Item
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                ) : (
                                                    <div className={`rounded-lg border px-3 py-4 text-center ${isDark ? 'border-slate-700 bg-slate-900/30 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                                                        <p className="text-xs">No department notes captured for this week yet.</p>
                                                        <p className="text-[11px] mt-1">
                                                            Add a department update above to get started.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                        </div>
                                    </div>
                                );
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
                            onSubmit={handleCreateComment}
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

// Action Item Form Component
const ActionItemForm = ({ actionItem, monthlyNotesId, users, isDark, onSave, onCancel }) => {
    const [title, setTitle] = useState(actionItem?.title || '');
    const [description, setDescription] = useState(actionItem?.description || '');
    const [status, setStatus] = useState(actionItem?.status || 'open');
    const [priority, setPriority] = useState(actionItem?.priority || 'medium');
    const [assignedUserId, setAssignedUserId] = useState(actionItem?.assignedUserId || '');
    const [dueDate, setDueDate] = useState(actionItem?.dueDate ? new Date(actionItem.dueDate).toISOString().split('T')[0] : '');

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
                <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Description</label>
                <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300'}`}
                    rows="3"
                />
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

// Comment Form Component
const CommentForm = ({ isDark, onSubmit, onCancel }) => {
    const [content, setContent] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (content.trim()) {
            onSubmit(content);
            setContent('');
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Comment</label>
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    required
                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300'}`}
                    rows="4"
                    placeholder="Enter your comment..."
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

