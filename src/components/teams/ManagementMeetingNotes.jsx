// Get dependencies from window
const { useState, useEffect, useMemo } = React;

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

// Department definitions - matching API
const DEPARTMENTS = [
    { id: 'compliance', name: 'Compliance', icon: 'fa-shield-alt', color: 'red' },
    { id: 'finance', name: 'Finance', icon: 'fa-coins', color: 'yellow' },
    { id: 'technical', name: 'Technical', icon: 'fa-tools', color: 'purple' },
    { id: 'data', name: 'Data', icon: 'fa-chart-line', color: 'indigo' },
    { id: 'support', name: 'Support', icon: 'fa-headset', color: 'green' },
    { id: 'commercial', name: 'Commercial', icon: 'fa-handshake', color: 'orange' },
    { id: 'business-development', name: 'Business Development', icon: 'fa-rocket', color: 'pink' }
];

const DEFAULT_GOAL_ENTRY = '- [ ] ';

const createEmptyMonthlyGoalsMap = () => {
    const template = {};
    DEPARTMENTS.forEach((dept) => {
        template[dept.id] = DEFAULT_GOAL_ENTRY;
    });
    return template;
};

const parseMonthlyGoalsString = (rawGoals) => {
    if (!rawGoals || typeof rawGoals !== 'string') {
        return createEmptyMonthlyGoalsMap();
    }

    const goalsMap = createEmptyMonthlyGoalsMap();
    const lines = rawGoals.split('\n');
    let currentDepartmentId = null;

    lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed && currentDepartmentId) {
            goalsMap[currentDepartmentId] = goalsMap[currentDepartmentId]
                ? `${goalsMap[currentDepartmentId]}\n`
                : '';
            return;
        }

        const matchedDepartment = DEPARTMENTS.find((dept) =>
            trimmed.toLowerCase().startsWith(`${dept.name.toLowerCase()} goals`)
        );

        if (matchedDepartment) {
            currentDepartmentId = matchedDepartment.id;
            goalsMap[currentDepartmentId] = '';
            return;
        }

        if (currentDepartmentId) {
            goalsMap[currentDepartmentId] = goalsMap[currentDepartmentId]
                ? `${goalsMap[currentDepartmentId]}\n${line}`
                : line;
        }
    });

    DEPARTMENTS.forEach((dept) => {
        const value = goalsMap[dept.id];
        if (!value || value.trim() === '') {
            goalsMap[dept.id] = DEFAULT_GOAL_ENTRY;
        }
    });

    return goalsMap;
};

const formatMonthlyGoalsString = (goalsMap) => {
    return DEPARTMENTS.map((dept) => {
        const rawValue = goalsMap?.[dept.id];
        const value = rawValue && rawValue.trim() !== '' ? rawValue : DEFAULT_GOAL_ENTRY;
        return `${dept.name} Goals:\n${value}`;
    }).join('\n\n');
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
    const [monthlyGoalsByDept, setMonthlyGoalsByDept] = useState(createEmptyMonthlyGoalsMap);
    
    // Modal states
    const [showAllocationModal, setShowAllocationModal] = useState(false);
    const [showActionItemModal, setShowActionItemModal] = useState(false);
    const [showCommentModal, setShowCommentModal] = useState(false);
    const [editingActionItem, setEditingActionItem] = useState(null);
    const [commentContext, setCommentContext] = useState(null); // {type: 'monthly'|'department'|'action', id: string}
    
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
    const handleCreateMonth = async () => {
        let monthKey = selectedMonth;
        if (!monthKey) {
            const now = new Date();
            monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            setSelectedMonth(monthKey);
        }

        // If we already have notes for this month, surface them instead of calling the API
        const existingNotes =
            currentMonthlyNotes?.monthKey === monthKey
                ? currentMonthlyNotes
                : monthlyNotesList.find(note => note?.monthKey === monthKey);

        if (existingNotes) {
            setCurrentMonthlyNotes(existingNotes);
            setSelectedMonth(monthKey);
            if (typeof alert === 'function') {
                alert('Monthly notes already exist for this month. Loaded the existing plan instead.');
            }
            return;
        }

        try {
            setLoading(true);
            const response = await window.DatabaseAPI.createMonthlyNotes(monthKey, '');
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
                setSelectedMonth(newNotes.monthKey || monthKey);
            }
        } catch (error) {
            console.error('Error creating monthly notes:', error);
            const errorMessage = (error?.message || '').toLowerCase();
            if (errorMessage.includes('already exist')) {
                try {
                    const monthResponse = await window.DatabaseAPI.getMeetingNotes(monthKey);
                    const duplicateNotes = monthResponse?.data?.monthlyNotes;
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
            } else if (typeof alert === 'function') {
                alert('Failed to create monthly notes');
            }
        } finally {
            setLoading(false);
        }
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

    useEffect(() => {
        if (!currentMonthlyNotes) {
            setMonthlyGoalsByDept(createEmptyMonthlyGoalsMap());
            return;
        }
        setMonthlyGoalsByDept(parseMonthlyGoalsString(currentMonthlyNotes.monthlyGoals));
    }, [currentMonthlyNotes?.id, currentMonthlyNotes?.monthlyGoals]);

    // Update monthly goals
    const handleUpdateMonthlyGoals = async (goalsMap) => {
        if (!currentMonthlyNotes) return;
        
        try {
            const formattedGoals = formatMonthlyGoalsString(goalsMap);
            const response = await window.DatabaseAPI.updateMonthlyNotes(currentMonthlyNotes.id, { monthlyGoals: formattedGoals });
            const updated = response.data?.monthlyNotes;
            if (updated) {
                setCurrentMonthlyNotes(updated);
                setMonthlyNotesList(prev => prev.map(n => n.id === updated.id ? updated : n));
                setMonthlyGoalsByDept(parseMonthlyGoalsString(updated.monthlyGoals));
            }
        } catch (error) {
            console.error('Error updating monthly goals:', error);
        }
    };

    // Create weekly notes
    const handleCreateWeek = async () => {
        if (!currentMonthlyNotes) {
            await handleCreateMonth();
            return;
        }
        
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay()); // Sunday
        weekStart.setHours(0, 0, 0, 0);
        
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        
        const weekKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
        
        const existingWeek = currentMonthlyNotes?.weeklyNotes?.find(week => week?.weekKey === weekKey);
        if (existingWeek) {
            setSelectedWeek(weekKey);
            if (typeof alert === 'function') {
                alert('Weekly notes already exist for this week. Loaded the existing notes instead.');
            }
            return;
        }

        try {
            setLoading(true);
            const response = await window.DatabaseAPI.createWeeklyNotes(
                currentMonthlyNotes.id,
                weekKey,
                weekStart.toISOString(),
                weekEnd.toISOString()
            );
            const newWeek = response.data?.weeklyNotes;
            if (newWeek) {
                // Reload current month's notes
                const monthResponse = await window.DatabaseAPI.getMeetingNotes(selectedMonth);
                setCurrentMonthlyNotes(monthResponse.data?.monthlyNotes);
            }
        } catch (error) {
            console.error('Error creating weekly notes:', error);
            const errorMessage = (error?.message || '').toLowerCase();
            
            if (errorMessage.includes('already exist')) {
                console.info('Weekly notes already exist for the selected week, reloading current month data.');
                try {
                    const monthResponse = await window.DatabaseAPI.getMeetingNotes(selectedMonth);
                    const monthNotes = monthResponse?.data?.monthlyNotes;
                    if (monthNotes) {
                        setCurrentMonthlyNotes(monthNotes);
                        if (typeof alert === 'function') {
                            alert('Weekly notes already exist for this week. Loaded the existing notes instead.');
                        }
                    } else if (typeof alert === 'function') {
                        alert('Weekly notes already exist for this week.');
                    }
                } catch (loadError) {
                    console.error('Failed to reload monthly notes after duplicate weekly warning:', loadError);
                    if (typeof alert === 'function') {
                        alert('Weekly notes already exist for this week, but we could not load them automatically. Please refresh and try again.');
                    }
                }
            } else {
                if (typeof alert === 'function') {
                    alert('Failed to create weekly notes');
                }
            }
        } finally {
            setLoading(false);
        }
    };

    // Update department notes
    const handleUpdateDepartmentNotes = async (departmentNotesId, field, value) => {
        try {
            const updateData = { [field]: value };
            const response = await window.DatabaseAPI.updateDepartmentNotes(departmentNotesId, updateData);
            const updated = response.data?.departmentNotes;
            if (updated) {
                // Reload current month's notes
                const monthResponse = await window.DatabaseAPI.getMeetingNotes(selectedMonth);
                setCurrentMonthlyNotes(monthResponse.data?.monthlyNotes);
            }
        } catch (error) {
            console.error('Error updating department notes:', error);
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
                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Monthly goals and weekly department updates</p>
                </div>
                <div className="flex gap-2">
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
                    <button
                        onClick={handleCreateMonth}
                        className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
                    >
                        <i className="fas fa-plus mr-1"></i>
                        New Month
                    </button>
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
                </div>
            </div>

            {/* Month Selection Info */}
            {selectedMonth && currentMonthlyNotes && (
                <div className={`rounded-lg border p-3 ${isDark ? 'bg-blue-900/30 border-blue-700' : 'bg-blue-50 border-blue-200'}`}>
                    <div className="flex items-center justify-between">
                        <h3 className={`text-sm font-semibold ${isDark ? 'text-blue-100' : 'text-blue-900'}`}>
                            {formatMonth(selectedMonth)}
                        </h3>
                        <button
                            onClick={handleCreateWeek}
                            className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                        >
                            <i className="fas fa-plus mr-1"></i>
                            Add Week
                        </button>
                    </div>
                </div>
            )}

            {/* Monthly Goals Section */}
            {selectedMonth && currentMonthlyNotes && (
                <div className={`rounded-lg border p-4 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                            <i className="fas fa-bullseye mr-2 text-primary-600"></i>
                            Monthly Goals by Department
                        </h3>
                        <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                            Updates save automatically
                        </p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {DEPARTMENTS.map((dept) => {
                            const goalValue = monthlyGoalsByDept?.[dept.id] ?? DEFAULT_GOAL_ENTRY;
                            const allocations = currentMonthlyNotes.userAllocations?.filter((a) => a.departmentId === dept.id) || [];
                            const allocationLabel = allocations.length > 0
                                ? `Owners: ${allocations.map((a) => a.user?.name || 'Unknown').join(', ')}`
                                : 'No owners allocated';

                            return (
                                <div
                                    key={dept.id}
                                    className={`rounded-lg border p-3 ${isDark ? 'bg-slate-900/40 border-slate-700' : 'bg-gray-50 border-gray-200'}`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${isDark ? 'bg-slate-700 text-slate-100' : 'bg-white text-gray-700'} shadow-sm`}>
                                                <i className={`fas ${dept.icon}`}></i>
                                            </span>
                                            <div>
                                                <p className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{dept.name}</p>
                                                <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>{allocationLabel}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <textarea
                                        value={goalValue}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            setMonthlyGoalsByDept((prev) => {
                                                const next = { ...(prev || createEmptyMonthlyGoalsMap()), [dept.id]: value };
                                                handleUpdateMonthlyGoals(next);
                                                return next;
                                            });
                                        }}
                                        placeholder={`Enter ${dept.name.toLowerCase()} goals for this month...`}
                                        className={`w-full min-h-[100px] p-2 text-xs border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${isDark ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'}`}
                                    />
                                </div>
                            );
                        })}
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
                    {weeks.map((week) => (
                        <div key={week.id || week.weekKey} className={`rounded-lg border p-4 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                                    <i className="fas fa-calendar-week mr-2 text-primary-600"></i>
                                    Week: {formatWeek(week.weekKey, week.weekStart)}
                                </h3>
                                <button
                                    onClick={() => {
                                        setSelectedWeek(week.weekKey === selectedWeek ? null : week.weekKey);
                                    }}
                                    className={`text-xs ${isDark ? 'text-primary-400 hover:text-primary-300' : 'text-primary-600 hover:text-primary-700'}`}
                                >
                                    {selectedWeek === week.weekKey ? (
                                        <><i className="fas fa-chevron-up mr-1"></i> Collapse</>
                                    ) : (
                                        <><i className="fas fa-chevron-down mr-1"></i> Expand</>
                                    )}
                                </button>
                            </div>

                            {selectedWeek === week.weekKey && (
                                <div className="space-y-4">
                                    {DEPARTMENTS.map((dept) => {
                                        const deptNote = week.departmentNotes?.find(
                                            dn => dn.departmentId === dept.id
                                        );

                                        if (!deptNote) return null;

                                        const allocations = currentMonthlyNotes.userAllocations?.filter(
                                            a => a.departmentId === dept.id
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
                                                                {allocations.map(allocation => (
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
                                                            value={deptNote.successes || ''}
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
                                                            value={deptNote.weekToFollow || ''}
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
                                                            value={deptNote.frustrations || ''}
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
                                                                {deptNote.actionItems.map(item => (
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
                                                                {deptNote.comments.map(comment => (
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
                                    })}
                                </div>
                            )}
                        </div>
                    ))}
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
