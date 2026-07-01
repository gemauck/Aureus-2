// Get dependencies from window (DiscussionModal, ManagementMeetingNotes read at load; TeamDiscussions read at render so lazy load works)
const { useState, useEffect, useMemo, useCallback, useRef } = React;
const storage = window.storage;
const DiscussionModal = window.DiscussionModal;
const ManagementMeetingNotes = window.ManagementMeetingNotes;

/** On-demand dist scripts — keeps ~380KB of meeting notes + process hub out of the global lazy-loader batches. */
const teamsDistScriptInflight = new Map();
function teamsCompiledScriptUrl(componentBaseName) {
    const isDev =
        typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    let cacheVersion = String(Date.now());
    try {
        if (typeof window !== 'undefined' && window.BUILD_VERSION) {
            cacheVersion = isDev ? `${window.BUILD_VERSION}-${Date.now()}` : String(window.BUILD_VERSION);
        }
    } catch (_) {
        /* ignore */
    }
    return `/dist/src/components/teams/${componentBaseName}.js?v=${encodeURIComponent(cacheVersion)}`;
}

function loadTeamsDistScript(componentBaseName) {
    if (componentBaseName === 'TeamProcessHub' && window.TeamProcessHub) return Promise.resolve();
    if (componentBaseName === 'ManagementMeetingNotes' && window.ManagementMeetingNotes) return Promise.resolve();
    if (teamsDistScriptInflight.has(componentBaseName)) return teamsDistScriptInflight.get(componentBaseName);

    const p = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.async = true;
        script.src = teamsCompiledScriptUrl(componentBaseName);
        script.onload = () => {
            teamsDistScriptInflight.delete(componentBaseName);
            resolve();
        };
        script.onerror = () => {
            teamsDistScriptInflight.delete(componentBaseName);
            reject(new Error(`Failed to load ${componentBaseName}`));
        };
        document.body.appendChild(script);
    });
    teamsDistScriptInflight.set(componentBaseName, p);
    return p;
}

const SARS_MONITORING_TEAM_IDS = new Set(['compliance', 'finance', 'commercial']);

function teamHasSarsMonitoring(team) {
    if (!team) return false;
    const id = String(team.id || '').toLowerCase();
    if (SARS_MONITORING_TEAM_IDS.has(id)) return true;
    const name = String(team.name || '').toLowerCase();
    return SARS_MONITORING_TEAM_IDS.has(name);
}

const Teams = () => {
    // Teams state - fetched from API
    const [teams, setTeams] = useState([]);
    const [teamsLoading, setTeamsLoading] = useState(true);
    const [teamsError, setTeamsError] = useState(null);
    const normalizePermissions = (permissions) => {
        if (!permissions) return [];
        if (Array.isArray(permissions)) return permissions;
        if (typeof permissions === 'string') {
            try {
                const parsed = JSON.parse(permissions);
                return Array.isArray(parsed) ? parsed : [];
            } catch (error) {
                console.warn('Teams: Failed to parse permissions string:', error);
                return [];
            }
        }
        return [];
    };

    const getCurrentUser = () => {
        try {
            if (window.storage?.getUser) {
                const user = window.storage.getUser();
                if (user && (user.id || user.email)) {
                    return {
                        ...user,
                        permissions: normalizePermissions(user.permissions)
                    };
                }
            }

            const storedUser = localStorage.getItem('abcotronics_user');
            if (storedUser && storedUser !== 'null' && storedUser !== 'undefined') {
                const parsed = JSON.parse(storedUser);
                const user = parsed.user || parsed.data?.user || parsed;
                if (user && (user.id || user.email)) {
                    return {
                        ...user,
                        permissions: normalizePermissions(user.permissions)
                    };
                }
            }

            const legacyUser = localStorage.getItem('currentUser');
            if (legacyUser && legacyUser !== 'null' && legacyUser !== 'undefined') {
                const parsed = JSON.parse(legacyUser);
                if (parsed && (parsed.id || parsed.email || parsed.username)) {
                    return {
                        id: parsed.id || parsed.email || parsed.username,
                        name: parsed.name || parsed.username || 'User',
                        email: parsed.email || parsed.username || '',
                        role: parsed.role || '',
                        permissions: normalizePermissions(parsed.permissions)
                    };
                }
            }
        } catch (error) {
            console.warn('Teams: Error retrieving current user', error);
        }

        return {
            id: 'anonymous',
            name: 'User',
            role: '',
            permissions: []
        };
    };

    const authHook = window.useAuth || (() => ({ user: null }));
    const { user: authUser } = authHook();

    const sanitizeUser = (user) => {
        if (!user) return null;
        return {
            ...user,
            permissions: normalizePermissions(user.permissions)
        };
    };

    const [currentUser, setCurrentUser] = useState(() => sanitizeUser(authUser) || getCurrentUser());

    // Fetch teams from API
    useEffect(() => {
        const fetchTeams = async () => {
            try {
                setTeamsLoading(true);
                setTeamsError(null);
                
                const token = window.storage?.getToken?.() || localStorage.getItem('abcotronics_token') || localStorage.getItem('authToken') || localStorage.getItem('auth_token');
                if (!token) {
                    console.warn('Teams: No auth token available');
                    setTeamsLoading(false);
                    setIsReady(true);
                    return;
                }

                const response = await fetch('/api/teams', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    const status = response.status;
                    const msg = status === 502 ? 'Server unavailable (502). Try again in a moment.' :
                        status === 503 ? 'Service temporarily unavailable.' :
                        status === 504 ? 'Request timed out.' :
                        `Failed to fetch teams: ${status} ${response.statusText}`;
                    throw new Error(msg);
                }

                let data;
                try {
                    data = await response.json();
                } catch (_) {
                    throw new Error('Invalid response from server. Try again.');
                }
                if (data.data && Array.isArray(data.data.teams)) {
                    // Format teams to match expected structure (include memberships for admin member management)
                    const formattedTeams = data.data.teams
                        .map(team => ({
                            id: team.id,
                            name: team.name,
                            icon: team.icon || '',
                            color: team.color || 'blue',
                            description: team.description || '',
                            members: team.members || 0,
                            permissions: team.permissions || [],
                            isActive: team.isActive !== false,
                            memberships: team.memberships || [],
                            counts: team.counts || {}
                        }))
                        .filter(team => {
                            // Filter out Default Team
                            const nameLower = (team.name || '').toLowerCase();
                            const idLower = (team.id || '').toLowerCase();
                            return nameLower !== 'default team' && 
                                   idLower !== 'default' && 
                                   idLower !== 'default-team';
                        });
                    setTeams(formattedTeams);
                } else {
                    console.warn('Teams: Unexpected API response format', data);
                    setTeams([]);
                }
            } catch (error) {
                console.error('Teams: Error fetching teams from API:', error);
                setTeamsError(error.message);
                // Fallback to empty array on error
                setTeams([]);
            } finally {
                setTeamsLoading(false);
                setIsReady(true);
            }
        };

        fetchTeams();
    }, []);

    useEffect(() => {
        const sanitizedAuthUser = sanitizeUser(authUser);
        if (!sanitizedAuthUser) {
            return;
        }

        setCurrentUser((prevUser) => {
            if (!prevUser) {
                return sanitizedAuthUser;
            }

            const prevPermissions = (prevUser.permissions || []).slice().sort().join('|');
            const nextPermissions = (sanitizedAuthUser.permissions || []).slice().sort().join('|');

            const isSameUser =
                prevUser.id === sanitizedAuthUser.id &&
                prevUser.role === sanitizedAuthUser.role &&
                prevPermissions === nextPermissions;

            return isSameUser ? prevUser : sanitizedAuthUser;
        });
    }, [authUser]);

    const isAdminUser = useMemo(() => {
        const role = (currentUser?.role || '').toString().trim().toLowerCase();
        const adminRoles = ['admin', 'administrator', 'superadmin', 'super-admin', 'super_admin', 'system_admin'];
        if (adminRoles.includes(role)) {
            return true;
        }

        const permissions = normalizePermissions(currentUser?.permissions);
        const normalizedPermissions = permissions.map((perm) => (perm || '').toString().trim().toLowerCase());
        const adminPermissionKeys = ['admin', 'administrator', 'superadmin', 'super-admin', 'super_admin', 'system_admin'];

        return normalizedPermissions.some((perm) => adminPermissionKeys.includes(perm));
    }, [currentUser]);

    /** Must match api/_lib/dispenseExceptionPrepAccess.js */
    const DISPENSE_EXCEPTION_PREP_ALLOWED_EMAIL = 'garethm@abcotronics.co.za';
    const canAccessDispenseExceptionPrep = useMemo(() => {
        const email = (currentUser?.email || '').trim().toLowerCase();
        return email === DISPENSE_EXCEPTION_PREP_ALLOWED_EMAIL.toLowerCase();
    }, [currentUser]);

    const isTeamAccessible = useCallback(
        (teamId) => {
            if (teamId === 'management') {
                return isAdminUser;
            }
            return true;
        },
        [isAdminUser]
    );

    // Get theme state - CRITICAL: Use React state, not document root class
    let themeResult = { isDark: false };
    try {
        if (window.useTheme && typeof window.useTheme === 'function') {
            themeResult = window.useTheme();
        }
    } catch (error) {
        // Fallback: check localStorage only
        try {
            const storedTheme = localStorage.getItem('abcotronics_theme');
            themeResult.isDark = storedTheme === 'dark';
        } catch (e) {
            themeResult.isDark = false;
        }
    }
    const isDark = themeResult?.isDark || false;
    
    // Query params: merge hash (#/teams/...?...) with pathname ?search (same as ManagementMeetingNotes / RouteState — hash wins on duplicate keys).
    const getSearchParams = () => {
        const merged = new URLSearchParams();
        const hash = window.location.hash || '';
        if (hash.indexOf('?') !== -1) {
            new URLSearchParams(hash.slice(hash.indexOf('?') + 1)).forEach((value, key) => {
                merged.set(key, value);
            });
        }
        const search = window.location.search || '';
        if (search.length > 1) {
            new URLSearchParams(search.slice(1)).forEach((value, key) => {
                if (!merged.has(key)) {
                    merged.set(key, value);
                }
            });
        }
        return merged;
    };

    // Initialize activeTab from URL or default to 'overview'
    const getTabFromURL = () => {
        const urlParams = getSearchParams();
        const tab = urlParams.get('tab') || 'overview';
        // Map legacy tabs to discussions
        if (['documents', 'workflows', 'checklists', 'notices'].includes(tab)) return 'discussions';
        if (['overview', 'discussions', 'process-flows', 'meeting-notes', 'poa-review', 'dfrr-check', 'dispense-exception-prep', 'sars-monitoring', 'members'].includes(tab)) return tab;
        return 'overview';
    };
    
    // ALL useState hooks must be declared before any useEffect hooks
    const [activeTab, setActiveTabState] = useState(getTabFromURL());
    const [selectedTeam, setSelectedTeam] = useState(() => {
        // Initialize from URL if available (will be updated after teams load)
        return null;
    });
    
    // Ref to track current tab for async operations
    const activeTabRef = useRef(activeTab);
    useEffect(() => {
        activeTabRef.current = activeTab;
    }, [activeTab]);

    useEffect(() => {
        if (activeTab === 'dispense-exception-prep' && !canAccessDispenseExceptionPrep) {
            setActiveTabState('overview');
        }
    }, [activeTab, canAccessDispenseExceptionPrep]);
    
    // Wrapper for setActiveTab that BLOCKS navigation until saves complete
    const setActiveTab = useCallback(async (newTab) => {
        // If switching away from meeting-notes, CHECK FIRST - synchronous check
        const currentTab = activeTabRef.current;
        if (currentTab === 'meeting-notes' && newTab !== 'meeting-notes') {
            const meetingNotesRef = window.ManagementMeetingNotesRef;
            
            // Check for unsaved changes
            if (meetingNotesRef?.current?.hasPendingSaves?.()) {
                // Warn user about unsaved changes
                const hasUnsaved = await meetingNotesRef.current.flushPendingSaves();
                if (hasUnsaved) {
                    const confirmMessage = 'You have unsaved changes in meeting notes. Are you sure you want to switch tabs?';
                    if (!window.confirm(confirmMessage)) {
                        // User cancelled - don't switch tabs
                        return;
                    }
                    // User confirmed - allow tab switch (changes will remain unsaved)
                }
            }
        }
        
        // No blocking needed - allow immediate switch
        setActiveTabState(newTab);
        
        // Update URL with tab if team is selected
        if (selectedTeam && window.RouteState) {
            const searchParams = new URLSearchParams();
            searchParams.set('tab', newTab);
            window.RouteState.navigate({
                page: 'teams',
                segments: [String(selectedTeam.id)],
                search: `?${searchParams.toString()}`,
                hash: '',
                replace: false,
                preserveSearch: false,
                preserveHash: false
            });
        }
    }, [selectedTeam]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isReady, setIsReady] = useState(false);
    
    // Track initial mount to avoid overwriting URL params on first load
    const isInitialMount = useRef(true);
    
    // Modal states
    // State to track ManagementMeetingNotes availability (set when script registers or on-demand load finishes)
    const [managementMeetingNotesAvailable, setManagementMeetingNotesAvailable] = useState(!!window.ManagementMeetingNotes);
    const [meetingNotesLoadError, setMeetingNotesLoadError] = useState('');
    const [processHubLoadError, setProcessHubLoadError] = useState('');
    // Force re-render when on discussions tab until lazy-loaded TeamDiscussions is available
    const [, setDiscussionsReadyTick] = useState(0);
    const [, setProcessFlowsReadyTick] = useState(0);
    // Members management (admin only)
    const [membersLoading, setMembersLoading] = useState(false);
    const [availableUsers, setAvailableUsers] = useState([]);
    const [addMemberUserId, setAddMemberUserId] = useState('');
    const [addMemberSearch, setAddMemberSearch] = useState('');
    const [addMemberPickerOpen, setAddMemberPickerOpen] = useState(false);
    const addMemberInputRef = useRef(null);
    
    // Validate selectedTeam from URL after component mounts, teams load, and isAdminUser is computed
    useEffect(() => {
        if (teamsLoading || teams.length === 0) return; // Wait for teams to load
        
        const urlParams = getSearchParams();
        const teamId = urlParams.get('team');
        if (teamId) {
            const team = teams.find(t => t.id === teamId || String(t.id) === String(teamId));
            if (team) {
                // If team is accessible, set it; otherwise clear it
                if (isTeamAccessible(team.id)) {
                    if (!selectedTeam || selectedTeam.id !== team.id) {
                        setSelectedTeam(team);
                    }
                } else {
                    // Team not accessible, clear selection
                    if (selectedTeam) {
                        setSelectedTeam(null);
                        setActiveTab('overview');
                    }
                }
            }
        }
    }, [teamsLoading, teams, isAdminUser, isTeamAccessible, selectedTeam]);
    
    // Update URL when tab changes - preserve existing params like month and week
    useEffect(() => {
        // On initial mount, check if URL already has the correct params
        // If so, don't update URL to preserve params like month and week
        if (isInitialMount.current) {
            const urlParams = getSearchParams();
            const urlTab = urlParams.get('tab') || 'overview';
            const urlTeam = urlParams.get('team');
            
            const tabMatches = (urlTab === 'overview' && activeTab === 'overview') || 
                              (urlTab === activeTab);
            const teamMatches = (!urlTeam && !selectedTeam?.id) || 
                               (urlTeam === selectedTeam?.id);
            
            // If URL already matches state, mark as not initial mount and return
            // This preserves existing URL params (month, week, etc.)
            if (tabMatches && teamMatches) {
                isInitialMount.current = false;
                return;
            }
            isInitialMount.current = false;
        }
        
        const url = new URL(window.location.href);
        const existing = getSearchParams();
        const preserveMonth = existing.get('month');
        const preserveWeek = existing.get('week');

        if (selectedTeam?.id === 'management' && activeTab === 'meeting-notes') {
            url.searchParams.set('tab', 'meeting-notes');
            url.searchParams.set('team', 'management');
            if (preserveMonth) {
                url.searchParams.set('month', preserveMonth);
            }
            if (preserveWeek) {
                url.searchParams.set('week', preserveWeek);
            }
        } else if (activeTab !== 'overview') {
            url.searchParams.set('tab', activeTab);
            if (selectedTeam?.id) {
                url.searchParams.set('team', selectedTeam.id);
            }
        } else {
            // Remove tab param for overview
            url.searchParams.delete('tab');
            if (selectedTeam?.id) {
                url.searchParams.set('team', selectedTeam.id);
            } else {
                url.searchParams.delete('team');
            }
        }
        
        // Preserve all other existing params (like month, week, etc.)
        // They are already in the URL object, so we just need to make sure we don't delete them
        
        window.history.pushState({ tab: activeTab, team: selectedTeam?.id }, '', url);
    }, [activeTab, selectedTeam]);
    
    // Also handle browser back/forward with save waiting
    useEffect(() => {
        const handlePopState = async (event) => {
            // Read tab from URL
            const urlTab = getTabFromURL();
            
            // If we're leaving meeting-notes, check for unsaved changes
            // Use setActiveTabState with functional update to get current value
            setActiveTabState((currentTab) => {
                if (currentTab === 'meeting-notes' && urlTab !== 'meeting-notes') {
                    const meetingNotesRef = window.ManagementMeetingNotesRef;
                    if (meetingNotesRef?.current?.hasPendingSaves?.()) {
                        // Check for unsaved changes and warn user
                        meetingNotesRef.current.flushPendingSaves().then((hasUnsaved) => {
                            if (hasUnsaved) {
                                const confirmMessage = 'You have unsaved changes in meeting notes. Are you sure you want to switch tabs?';
                                if (window.confirm(confirmMessage)) {
                                    // User confirmed - switch tab
                                    setActiveTabState(urlTab);
                                }
                                // If user cancelled, stay on current tab (don't switch)
                            } else {
                                // No unsaved changes - switch tab
                                setActiveTabState(urlTab);
                            }
                        }).catch((error) => {
                            console.error('Error checking for unsaved changes:', error);
                            // On error, allow navigation
                            setActiveTabState(urlTab);
                        });
                        // Return current tab for now, will be updated after confirmation
                        return currentTab;
                    }
                }
                // No pending saves, update immediately
                return urlTab;
            });
            
            // Read team from URL (search or hash)
            const urlParams = getSearchParams();
            const teamId = urlParams.get('team');
            if (teamId && teams.length > 0) {
                const team = teams.find(t => t.id === teamId || String(t.id) === String(teamId));
                if (team && isTeamAccessible(team.id)) {
                    setSelectedTeam(team);
                } else {
                    setSelectedTeam(null);
                }
            } else {
                setSelectedTeam(null);
            }
        };
        
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [isTeamAccessible]);
    
    // Listen for route changes to reset selected team when navigating to base teams page
    useEffect(() => {
        if (!window.RouteState) return;
        
        const handleRouteChange = async (route) => {
            if (route?.page !== 'teams') return;
            
            // If no segments, reset selected team
            if (!route.segments || route.segments.length === 0) {
                setSelectedTeam((currentTeam) => {
                    // Only reset if there's actually a team selected
                    if (currentTeam) {
                        setActiveTab('overview');
                        return null;
                    }
                    return currentTeam;
                });
                return;
            }
            
            // URL contains a team ID - open that team
            const teamId = route.segments[0];
            if (teamId && teams.length > 0) {
                const team = teams.find(t => t.id === teamId || String(t.id) === String(teamId));
                if (team && isTeamAccessible(team.id)) {
                    setSelectedTeam(team);
                    
                    // Handle tab from query params
                    const tab = route.search?.get('tab');
                    if (tab) {
                        setActiveTab(tab);
                    }
                }
            }
        };
        
        // Check initial route
        const currentRoute = window.RouteState.getRoute();
        handleRouteChange(currentRoute);
        
        // Subscribe to route changes
        const unsubscribe = window.RouteState.subscribe(handleRouteChange);
        
        return () => {
            if (unsubscribe && typeof unsubscribe === 'function') {
                unsubscribe();
            }
        };
    }, [isTeamAccessible]); // Removed selectedTeam from dependencies to prevent reset on selection

    // Load Management Meeting Notes only when the tab is opened (avoids downloading/parsing ~300KB for every Teams visit)
    useEffect(() => {
        setMeetingNotesLoadError('');
        if (activeTab !== 'meeting-notes' || selectedTeam?.id !== 'management') {
            return undefined;
        }
        if (window.ManagementMeetingNotes) {
            setManagementMeetingNotesAvailable(true);
            return undefined;
        }
        setManagementMeetingNotesAvailable(false);
        let cancelled = false;
        loadTeamsDistScript('ManagementMeetingNotes')
            .then(() => {
                if (cancelled) return;
                if (window.ManagementMeetingNotes) {
                    setManagementMeetingNotesAvailable(true);
                } else {
                    setMeetingNotesLoadError('Meeting notes failed to register. Try refreshing the page.');
                    setManagementMeetingNotesAvailable(false);
                }
            })
            .catch((e) => {
                if (!cancelled) {
                    setMeetingNotesLoadError(e?.message || 'Could not load meeting notes.');
                    setManagementMeetingNotesAvailable(false);
                    console.warn('Teams: ManagementMeetingNotes on-demand load failed', e);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [activeTab, selectedTeam?.id]);

    // Load Process Hub only when the tab is opened
    useEffect(() => {
        setProcessHubLoadError('');
        if (activeTab !== 'process-flows' || !selectedTeam) {
            return undefined;
        }
        if (window.TeamProcessHub) {
            setProcessFlowsReadyTick((t) => t + 1);
            return undefined;
        }
        let cancelled = false;
        loadTeamsDistScript('TeamProcessHub')
            .then(() => {
                if (cancelled) return;
                if (!window.TeamProcessHub) {
                    setProcessHubLoadError('Process hub failed to register. Try refreshing the page.');
                }
                setProcessFlowsReadyTick((t) => t + 1);
            })
            .catch((e) => {
                if (!cancelled) {
                    setProcessHubLoadError(e?.message || 'Could not load process hub.');
                    console.warn('Teams: TeamProcessHub on-demand load failed', e);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [activeTab, selectedTeam?.id]);

    // When on discussions tab, re-render periodically until lazy-loaded TeamDiscussions is available
    useEffect(() => {
        if (activeTab !== 'discussions' || window.TeamDiscussions) return;
        const id = setInterval(() => setDiscussionsReadyTick((t) => t + 1), 300);
        return () => clearInterval(id);
    }, [activeTab]);

    // Team discussion counts from API (teams list includes counts.discussions)
    const getTeamCounts = useCallback((teamId) => {
        const team = teams.find(t => t.id === teamId);
        const discussions = team?.counts?.discussions ?? 0;
        return { discussions };
    }, [teams]);

    // Validate selectedTeam from URL
    useEffect(() => {
        if (selectedTeam && !isTeamAccessible(selectedTeam.id)) {
            setSelectedTeam(null);
            setActiveTab('overview');
        }
    }, [selectedTeam, isTeamAccessible]);

    // Load users for add-member dropdown when Members tab is shown
    useEffect(() => {
        if (!isAdminUser || activeTab !== 'members' || !selectedTeam) return;
        let cancelled = false;
        const token = window.storage?.getToken?.() || localStorage.getItem('abcotronics_token') || localStorage.getItem('authToken') || localStorage.getItem('auth_token');
        if (!token) return;
        fetch('/api/users', { headers: { 'Authorization': `Bearer ${token}` } })
            .then(res => res.ok ? res.json() : Promise.reject(new Error('Failed to load users')))
            .then(data => {
                if (cancelled) return;
                const users = data.data?.users || data.users || [];
                setAvailableUsers(Array.isArray(users) ? users : []);
            })
            .catch(() => {
                if (!cancelled) setAvailableUsers([]);
            });
        return () => { cancelled = true; };
    }, [isAdminUser, activeTab, selectedTeam?.id]);

    // Refresh teams and update selectedTeam
    const refreshTeams = useCallback(async () => {
        const teamIdToKeep = selectedTeam?.id;
        try {
            const token = window.storage?.getToken?.() || localStorage.getItem('abcotronics_token') || localStorage.getItem('authToken') || localStorage.getItem('auth_token');
            if (!token) return;
            const response = await fetch('/api/teams', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            if (!response.ok) return;
            const data = await response.json();
            if (data.data && Array.isArray(data.data.teams)) {
                const formatted = data.data.teams
                    .map(team => ({
                        id: team.id,
                        name: team.name,
                        icon: team.icon || '',
                        color: team.color || 'blue',
                        description: team.description || '',
                        members: team.members || 0,
                        permissions: team.permissions || [],
                        isActive: team.isActive !== false,
                        memberships: team.memberships || [],
                        counts: team.counts || {}
                    }))
                    .filter(t => {
                        const n = (t.name || '').toLowerCase();
                        const i = (t.id || '').toLowerCase();
                        return n !== 'default team' && i !== 'default' && i !== 'default-team';
                    });
                setTeams(formatted);
                if (teamIdToKeep) {
                    const updated = formatted.find(t => t.id === teamIdToKeep || String(t.id) === String(teamIdToKeep));
                    if (updated) setSelectedTeam(updated);
                }
            }
        } catch (e) { console.warn('Teams: refresh failed', e); }
    }, [selectedTeam?.id]);

    const addMemberToTeam = useCallback(async (userId) => {
        if (!selectedTeam?.id || !userId) return;
        setMembersLoading(true);
        try {
            const token = window.storage?.getToken?.() || localStorage.getItem('abcotronics_token') || localStorage.getItem('authToken') || localStorage.getItem('auth_token');
            if (!token) throw new Error('Not authenticated');
            const res = await fetch(`/api/teams/${selectedTeam.id}/members`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, role: 'user' })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.error?.message || 'Failed to add member');
            }
            setAddMemberUserId('');
            setAddMemberSearch('');
            await refreshTeams();
        } catch (e) {
            if (typeof window.alert === 'function') window.alert(e.message || 'Failed to add member');
        } finally {
            setMembersLoading(false);
        }
    }, [selectedTeam?.id, refreshTeams]);

    const openTeamChat = useCallback(async () => {
        if (!selectedTeam?.id) return;
        try {
            const token = window.storage?.getToken?.() || localStorage.getItem('abcotronics_token') || localStorage.getItem('authToken') || localStorage.getItem('auth_token');
            if (!token) throw new Error('Not authenticated');
            const apiBase = window.DatabaseAPI?.API_BASE || window.location.origin;
            const res = await fetch(`${apiBase}/api/chat/from-team/${encodeURIComponent(selectedTeam.id)}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.error?.message || 'Could not open team chat');
            const conv = json?.data?.conversation || json?.conversation;
            const convId = conv?.id;
            if (!convId) throw new Error('No conversation returned');
            window.dispatchEvent(new CustomEvent('navigateToPage', { detail: { page: 'messages' } }));
            window.location.hash = `#/messages?conversation=${encodeURIComponent(convId)}`;
        } catch (e) {
            if (typeof window.alert === 'function') window.alert(e.message || 'Could not open team chat');
        }
    }, [selectedTeam?.id]);

    const removeMemberFromTeam = useCallback(async (userId) => {
        if (!selectedTeam?.id || !userId) return;
        if (!window.confirm('Remove this member from the team?')) return;
        setMembersLoading(true);
        try {
            const token = window.storage?.getToken?.() || localStorage.getItem('abcotronics_token') || localStorage.getItem('authToken') || localStorage.getItem('auth_token');
            if (!token) throw new Error('Not authenticated');
            const res = await fetch(`/api/teams/${selectedTeam.id}/members/${encodeURIComponent(userId)}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.error?.message || 'Failed to remove member');
            }
            await refreshTeams();
        } catch (e) {
            if (typeof window.alert === 'function') window.alert(e.message || 'Failed to remove member');
        } finally {
            setMembersLoading(false);
        }
    }, [selectedTeam?.id, refreshTeams]);

    const handleSelectTeam = useCallback((team) => {
        if (!isTeamAccessible(team.id)) {
            if (typeof window.alert === 'function') {
                window.alert('Only administrators can access the David Buttemer team.');
            }
            return;
        }
        setSelectedTeam(team);
        
        // Update URL to reflect the selected team
        if (window.RouteState && team?.id) {
            window.RouteState.setPageSubpath('teams', [String(team.id)], {
                replace: false,
                preserveSearch: false,
                preserveHash: false
            });
        }
        
        // Only set tab to 'discussions' if not already set from URL
        const urlParams = getSearchParams();
        const urlTab = urlParams.get('tab');
        if (!urlTab || urlTab === 'overview') {
            setActiveTab('discussions');
        } else {
            setActiveTab(urlTab);
        }
    }, [isTeamAccessible]);

    // Show minimal loading state to prevent renderer crash
    if (!isReady) {
        return (
            <div className="erp-module-root space-y-6">
                <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                    <div className={`w-10 h-10 sm:w-12 sm:h-12 ${isDark ? 'bg-gray-800' : 'bg-gray-100'} rounded-xl flex items-center justify-center flex-shrink-0`}>
                        <i className={`fas fa-users ${isDark ? 'text-gray-300' : 'text-gray-600'} text-sm sm:text-lg`}></i>
                    </div>
                    <div className="flex-1 min-w-0">
                        <h1 className={`text-xl sm:text-2xl font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Teams & Knowledge Hub</h1>
                        <p className={`text-sm mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Loading...</p>
                    </div>
                </div>
                <div className={`${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} rounded-xl border p-8 shadow-sm`}>
                    <div className="text-center py-12">
                        <div className={`inline-block animate-spin rounded-full h-8 w-8 border-b-2 mb-3 ${isDark ? 'border-blue-400' : 'border-blue-600'}`}></div>
                        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Loading Teams module...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="erp-module-root space-y-6">
            {/* Header - minimal theme matching Dashboard/Projects */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-6">
                <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                    <div className={`w-10 h-10 sm:w-12 sm:h-12 ${isDark ? 'bg-gray-800' : 'bg-gray-100'} rounded-xl flex items-center justify-center flex-shrink-0`}>
                        <i className={`fas fa-users ${isDark ? 'text-gray-300' : 'text-gray-600'} text-sm sm:text-lg`}></i>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                                <h1 className={`text-xl sm:text-2xl font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Teams & Knowledge Hub</h1>
                                <p className={`text-sm mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Centralized documentation, workflows, and team collaboration</p>
                            </div>
                            {selectedTeam && (
                                <button
                                    onClick={() => {
                                        setSelectedTeam(null);
                                        if (window.RouteState) {
                                            window.RouteState.setPageSubpath('teams', [], {
                                                replace: false,
                                                preserveSearch: false,
                                                preserveHash: false
                                            });
                                        }
                                    }}
                                    className={`px-4 py-2.5 rounded-lg transition-all duration-200 flex items-center text-sm font-medium min-h-[44px] sm:min-h-0 shrink-0 ${
                                        isDark
                                            ? 'bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-750'
                                            : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                                    }`}
                                    aria-label="Back to all teams"
                                >
                                    <i className="fas fa-arrow-left mr-2 text-xs" aria-hidden="true"></i>
                                    <span className="hidden sm:inline">Back to All Teams</span>
                                    <span className="sm:hidden">Back</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Search and Filter Bar - minimal theme */}
            {selectedTeam && (
                <div className={`${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} rounded-xl border p-5 shadow-sm`}>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1">
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder={activeTab === 'process-flows' ? 'Search flows and documents…' : 'Search discussions…'}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-colors ${
                                        isDark
                                            ? 'bg-gray-800 border-gray-700 text-gray-200 placeholder-gray-400 focus:bg-gray-800'
                                            : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-500 focus:bg-white'
                                    }`}
                                    aria-label="Search"
                                />
                                <i className={`fas fa-search absolute left-3 top-3.5 text-sm ${isDark ? 'text-gray-400' : 'text-gray-400'}`}></i>
                                {searchTerm && (
                                    <button
                                        onClick={() => setSearchTerm('')}
                                        className={`absolute right-3 top-3.5 transition-colors ${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-600'}`}
                                        title="Clear search"
                                    >
                                        <i className="fas fa-times text-sm"></i>
                                    </button>
                                )}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={openTeamChat}
                            className={`shrink-0 px-4 py-3 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 min-h-[44px] ${
                                isDark
                                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 shadow-lg shadow-blue-900/30'
                                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 shadow-md'
                            }`}
                            title="Open group chat with all team members"
                        >
                            <i className="fas fa-comments" aria-hidden="true" />
                            <span className="hidden sm:inline">Message team</span>
                            <span className="sm:hidden">Chat</span>
                        </button>
                        <div className={`flex items-center flex-wrap sm:flex-nowrap gap-2 ${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} rounded-xl border p-1.5 shrink-0`} role="group" aria-label="Section tabs">
                            <button
                                onClick={() => setActiveTab('discussions')}
                                className={`px-3 py-2 text-sm font-medium transition-all duration-200 shrink-0 rounded-lg ${
                                    activeTab === 'discussions'
                                        ? isDark ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'
                                        : isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                }`}
                            >
                                <i className="fas fa-comments mr-1.5"></i>
                                <span className="hidden sm:inline">Discussions</span>
                                <span className="sm:hidden">Discuss</span>
                            </button>
                            <button
                                onClick={() => setActiveTab('process-flows')}
                                className={`px-3 py-2 text-sm font-medium transition-all duration-200 shrink-0 rounded-lg ${
                                    activeTab === 'process-flows'
                                        ? isDark
                                            ? 'bg-gradient-to-r from-cyan-900/80 to-sky-900/80 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.25)] border border-cyan-700/50'
                                            : 'bg-gradient-to-r from-sky-100 to-cyan-50 text-sky-900 shadow-sm border border-sky-200/90'
                                        : isDark ? 'text-gray-400 hover:text-cyan-200 hover:bg-gray-800/90' : 'text-gray-600 hover:text-sky-800 hover:bg-sky-50/80'
                                }`}
                            >
                                <i className="fas fa-diagram-project mr-1.5"></i>
                                <span className="hidden sm:inline">Process flows</span>
                                <span className="sm:hidden">Flows</span>
                            </button>
                            {selectedTeam?.id === 'management' && (
                                <button
                                    onClick={() => setActiveTab('meeting-notes')}
                                    className={`px-3 py-2 text-sm font-medium transition-all duration-200 shrink-0 rounded-lg ${
                                        activeTab === 'meeting-notes'
                                            ? isDark ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'
                                            : isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                                >
                                    <i className="fas fa-clipboard-list mr-1.5"></i>
                                    <span className="hidden sm:inline">Meeting Notes</span>
                                    <span className="sm:hidden">Notes</span>
                                </button>
                            )}
                            {selectedTeam?.id === 'data-analytics' && (
                                <>
                                    <button
                                        onClick={() => setActiveTab('poa-review')}
                                        className={`px-3 py-2 text-sm font-medium transition-all duration-200 shrink-0 rounded-lg ${
                                            activeTab === 'poa-review'
                                                ? isDark ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'
                                                : isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                        }`}
                                    >
                                        <i className="fas fa-file-excel mr-1.5"></i>
                                        <span className="hidden sm:inline">POA Review</span>
                                        <span className="sm:hidden">POA</span>
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('dfrr-check')}
                                        className={`px-3 py-2 text-sm font-medium transition-all duration-200 shrink-0 rounded-lg ${
                                            activeTab === 'dfrr-check'
                                                ? isDark ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'
                                                : isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                        }`}
                                    >
                                        <i className="fas fa-gas-pump mr-1.5"></i>
                                        <span className="hidden sm:inline">DFRR Check</span>
                                        <span className="sm:hidden">DFRR</span>
                                    </button>
                                    {canAccessDispenseExceptionPrep && (
                                        <button
                                            onClick={() => setActiveTab('dispense-exception-prep')}
                                            className={`px-3 py-2 text-sm font-medium transition-all duration-200 shrink-0 rounded-lg ${
                                                activeTab === 'dispense-exception-prep'
                                                    ? isDark ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'
                                                    : isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                            }`}
                                        >
                                            <i className="fas fa-filter mr-1.5"></i>
                                            <span className="hidden sm:inline">Exception Prep</span>
                                            <span className="sm:hidden">Prep</span>
                                        </button>
                                    )}
                                </>
                            )}
                            {teamHasSarsMonitoring(selectedTeam) && (
                                <button
                                    onClick={() => setActiveTab('sars-monitoring')}
                                    className={`px-3 py-2 text-sm font-medium transition-all duration-200 shrink-0 rounded-lg ${
                                        activeTab === 'sars-monitoring'
                                            ? isDark ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'
                                            : isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                                >
                                    <i className="fas fa-globe mr-1.5"></i>
                                    <span className="hidden sm:inline">SARS Monitoring</span>
                                    <span className="sm:hidden">SARS</span>
                                </button>
                            )}
                            {isAdminUser && selectedTeam && (
                                <button
                                    onClick={() => setActiveTab('members')}
                                    className={`px-3 py-2 text-sm font-medium transition-all duration-200 shrink-0 rounded-lg ${
                                        activeTab === 'members'
                                            ? isDark ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'
                                            : isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                                >
                                    <i className="fas fa-user-plus mr-1.5"></i>
                                    <span className="hidden sm:inline">Members</span>
                                    <span className="sm:hidden">Members</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Overview - All Teams Grid */}
            {!selectedTeam && (
                <div className="space-y-6">
                    {/* Teams Grid */}
                    <div className={`rounded-xl border p-5 shadow-sm ${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'}`}>
                        <h2 className={`text-sm font-semibold mb-4 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Department Teams</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3">
                            {teamsLoading ? (
                                <div className={`col-span-full text-center py-8 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                    <div className={`inline-block animate-spin rounded-full h-6 w-6 border-b-2 mb-2 mx-auto ${isDark ? 'border-blue-400' : 'border-blue-600'}`}></div>
                                    Loading teams...
                                </div>
                            ) : teamsError ? (
                                <div className={`col-span-full text-center py-6 text-sm ${isDark ? 'text-red-400' : 'text-red-600'}`}>Error loading teams: {teamsError}</div>
                            ) : teams.length === 0 ? (
                                <div className={`col-span-full text-center py-8 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>No teams available</div>
                            ) : teams.map(team => {
                                const isAccessible = isTeamAccessible(team.id);
                                const counts = getTeamCounts(team.id);
                                return (
                                    <button
                                        key={team.id}
                                        onClick={() => handleSelectTeam(team)}
                                        className={`text-left border rounded-xl p-4 transition-all duration-200 group ${
                                            isDark ? 'bg-gray-900 border-gray-800 hover:bg-gray-800 hover:border-gray-700' : 'bg-white border-gray-100 hover:bg-gray-50 hover:border-gray-200'
                                        } ${isAccessible ? '' : 'opacity-60 cursor-not-allowed'}`}
                                        disabled={!isAccessible}
                                        aria-disabled={!isAccessible}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
                                                <i className={`fas ${team.icon} text-lg ${isDark ? 'text-gray-300' : 'text-gray-600'}`}></i>
                                            </div>
                                            <i className="fas fa-arrow-right text-gray-400 text-xs group-hover:text-blue-500 transition"></i>
                                        </div>
                                        <h3 className={`font-semibold text-sm mb-1 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{team.name}</h3>
                                        <p className={`text-xs mb-2 line-clamp-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{team.description}</p>
                                        {!isAccessible && (
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-lg ${isDark ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                                                <i className="fas fa-lock"></i>
                                                Admin only
                                            </span>
                                        )}
                                        <div className={`flex items-center gap-2 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                            <span><i className="fas fa-comments mr-1"></i>{counts.discussions}</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Team Detail View */}
            {selectedTeam && (
                <div className="space-y-6">
                    {/* Team Header */}
                    <div className={`rounded-xl p-4 border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                        <div className="flex items-center gap-3 mb-3">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                                <i className={`fas ${selectedTeam.icon} text-2xl ${isDark ? 'text-gray-300' : 'text-gray-600'}`}></i>
                            </div>
                            <div>
                                <h2 className={`text-lg font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{selectedTeam.name}</h2>
                                <p className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{selectedTeam.description}</p>
                            </div>
                        </div>
                        <div className={`flex flex-wrap gap-3 sm:gap-4 text-xs sm:text-sm ${isDark ? 'text-gray-300' : 'text-gray-800'}`}>
                            <div>
                                <span>Discussions: </span>
                                <span className="font-bold">{getTeamCounts(selectedTeam?.id)?.discussions ?? 0}</span>
                            </div>
                        </div>
                    </div>

                    {/* Content Display Based on Active Tab */}
                    <div className={`rounded-xl border p-5 shadow-sm ${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'}`}>
                        {activeTab === 'discussions' && (() => {
                            const TeamDiscussionsComponent = window.TeamDiscussions;
                            if (!TeamDiscussionsComponent) {
                                return (
                                    <div className={`flex items-center justify-center py-16 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                        <span className="animate-spin mr-2 inline-block w-6 h-6 border-2 border-current border-t-transparent rounded-full"></span>
                                        <span className="text-sm">Loading discussions…</span>
                                    </div>
                                );
                            }
                            return (
                                <TeamDiscussionsComponent team={selectedTeam} isDark={isDark} searchTerm={searchTerm} initialDiscussionId={getSearchParams().get('discussion') || undefined} />
                            );
                        })()}
                        {activeTab === 'process-flows' && (() => {
                            if (processHubLoadError) {
                                return (
                                    <div className={`text-center py-12 px-4 text-sm ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                                        {processHubLoadError}
                                    </div>
                                );
                            }
                            const Hub = window.TeamProcessHub;
                            if (!Hub) {
                                return (
                                    <div className={`flex items-center justify-center py-16 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                        <span className="animate-spin mr-2 inline-block w-6 h-6 border-2 border-current border-t-transparent rounded-full"></span>
                                        <span className="text-sm">Loading process hub…</span>
                                    </div>
                                );
                            }
                            return <Hub team={selectedTeam} isDark={isDark} searchTerm={searchTerm} />;
                        })()}
                        {activeTab === 'sars-monitoring' && teamHasSarsMonitoring(selectedTeam) && (() => {
                            const SarsMonitoringComponent = window.SarsMonitoring;
                            if (!SarsMonitoringComponent) {
                                return (
                                    <div className={`flex items-center justify-center py-16 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                        <span className="animate-spin mr-2 inline-block w-6 h-6 border-2 border-current border-t-transparent rounded-full"></span>
                                        <span className="text-sm">Loading SARS Monitoring…</span>
                                    </div>
                                );
                            }
                            return <SarsMonitoringComponent />;
                        })()}
                        {activeTab === 'meeting-notes' && selectedTeam?.id === 'management' && (() => {
                            if (meetingNotesLoadError) {
                                return (
                                    <div className={`text-center py-12 px-4 text-sm ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                                        {meetingNotesLoadError}
                                    </div>
                                );
                            }
                            const ComponentToRender = window.ManagementMeetingNotes || ManagementMeetingNotes;

                            if (!ComponentToRender) {
                                // Show loading state while waiting for component
                                if (managementMeetingNotesAvailable) {
                                    // Component was available but disappeared (shouldn't happen)
                                    return (
                                        <div className="text-center py-12">
                                            <i className={`fas fa-clipboard-list text-4xl mb-3 ${isDark ? 'text-gray-600' : 'text-gray-300'}`}></i>
                                            <p className="text-sm text-gray-500 ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-2">
                                                Meeting Notes component not available
                                            </p>
                                            <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                                Please refresh the page to load the component.
                                            </p>
                                        </div>
                                    );
                                } else {
                                    // Still loading
                                    return (
                                        <div className="text-center py-12">
                                            <i className={`fas fa-spinner fa-spin text-4xl mb-3 ${isDark ? 'text-gray-600' : 'text-gray-300'}`}></i>
                                            <p className="text-sm text-gray-500 ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-2">
                                                Loading Meeting Notes component...
                                            </p>
                                            <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                                Please wait while the component loads.
                                            </p>
                                        </div>
                                    );
                                }
                            }
                            
                            return (
                                <div>
                                    <ComponentToRender />
                                </div>
                            );
                        })()}

                        {activeTab === 'poa-review' && selectedTeam?.id === 'data-analytics' && (() => {
                            const ComponentToRender = window.POAReview;
                            
                            if (!ComponentToRender) {
                                return (
                                    <div className="text-center py-12">
                                        <i className={`fas fa-spinner fa-spin text-4xl mb-3 ${isDark ? 'text-gray-600' : 'text-gray-300'}`}></i>
                                        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-2`}>
                                            Loading POA Review component...
                                        </p>
                                        <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                            Please wait while the component loads.
                                        </p>
                                    </div>
                                );
                            }
                            
                            return (
                                <div>
                                    <ComponentToRender />
                                </div>
                            );
                        })()}

                        {activeTab === 'dfrr-check' && selectedTeam?.id === 'data-analytics' && (() => {
                            const ComponentToRender = window.DFRRCheck;

                            if (!ComponentToRender) {
                                return (
                                    <div className="text-center py-12">
                                        <i className={`fas fa-spinner fa-spin text-4xl mb-3 ${isDark ? 'text-gray-600' : 'text-gray-300'}`}></i>
                                        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-2`}>
                                            Loading DFRR Check…
                                        </p>
                                        <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                            Please wait while the component loads.
                                        </p>
                                    </div>
                                );
                            }

                            return (
                                <div>
                                    <ComponentToRender />
                                </div>
                            );
                        })()}

                        {activeTab === 'dispense-exception-prep' &&
                            selectedTeam?.id === 'data-analytics' &&
                            canAccessDispenseExceptionPrep &&
                            (() => {
                            const ComponentToRender = window.DispenseExceptionPrep;

                            if (!ComponentToRender) {
                                return (
                                    <div className="text-center py-12">
                                        <i className={`fas fa-spinner fa-spin text-4xl mb-3 ${isDark ? 'text-gray-600' : 'text-gray-300'}`}></i>
                                        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-2`}>
                                            Loading Exception Prep…
                                        </p>
                                        <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                            Please wait while the component loads.
                                        </p>
                                    </div>
                                );
                            }

                            return (
                                <div>
                                    <ComponentToRender />
                                </div>
                            );
                        })()}

                        {activeTab === 'members' && isAdminUser && selectedTeam && (() => {
                            const addableUsers = (availableUsers || []).filter(u =>
                                !(selectedTeam.memberships || []).some(m => String(m.userId) === String(u.id))
                            );
                            const q = (addMemberSearch || '').trim().toLowerCase();
                            const filteredUsers = q
                                ? addableUsers.filter(u => {
                                    const name = (u.name || '').toLowerCase();
                                    const email = (u.email || '').toLowerCase();
                                    return name.includes(q) || email.includes(q) || (u.name || u.email || '').includes(q);
                                })
                                : addableUsers;
                            const showPicker = addMemberPickerOpen && filteredUsers.length > 0;
                            const selectedUser = addMemberUserId ? addableUsers.find(u => String(u.id) === String(addMemberUserId)) : null;
                            return (
                            <div className="space-y-4">
                                <h3 className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Team Members</h3>
                                <div className="flex flex-wrap items-end gap-2 mb-4">
                                    <div className="flex-1 min-w-[200px] relative">
                                        <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Add member</label>
                                        <input
                                            ref={addMemberInputRef}
                                            type="text"
                                            value={selectedUser ? `${selectedUser.name || selectedUser.email || ''}${selectedUser.email ? ` (${selectedUser.email})` : ''}` : addMemberSearch}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setAddMemberUserId('');
                                                setAddMemberSearch(v);
                                                setAddMemberPickerOpen(true);
                                            }}
                                            onFocus={() => setAddMemberPickerOpen(true)}
                                            onBlur={() => setTimeout(() => setAddMemberPickerOpen(false), 150)}
                                            placeholder="Type to search by name or email…"
                                            disabled={membersLoading}
                                            className={`w-full px-3 py-2 rounded-lg border text-sm ${
                                                isDark
                                                    ? 'bg-gray-800 border-gray-700 text-gray-200'
                                                    : 'bg-white border-gray-300 text-gray-900'
                                            }`}
                                        />
                                        {showPicker && (
                                            <ul
                                                className={`absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-auto rounded-lg border shadow-lg py-1 ${
                                                    isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                                                }`}
                                            >
                                                {filteredUsers.slice(0, 20).map(u => (
                                                    <li key={u.id}>
                                                        <button
                                                            type="button"
                                                            onMouseDown={(e) => {
                                                                e.preventDefault();
                                                                setAddMemberUserId(u.id);
                                                                setAddMemberSearch('');
                                                                setAddMemberPickerOpen(false);
                                                                addMemberInputRef.current?.focus();
                                                            }}
                                                            className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                                                                isDark ? 'hover:bg-gray-700 text-gray-100' : 'hover:bg-gray-50 text-gray-900'
                                                            }`}
                                                        >
                                                            {u.name || u.email || u.username || u.id} {u.email ? <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>({u.email})</span> : ''}
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => addMemberToTeam(addMemberUserId)}
                                        disabled={!addMemberUserId || membersLoading}
                                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                            addMemberUserId && !membersLoading
                                                ? isDark ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'
                                                : isDark ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                        }`}
                                    >
                                        {membersLoading ? 'Adding…' : 'Add'}
                                    </button>
                                </div>
                                <ul className={`divide-y ${isDark ? 'divide-gray-800' : 'divide-gray-200'}`}>
                                    {(selectedTeam.memberships || []).length === 0 ? (
                                        <li className={`py-4 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>No members yet.</li>
                                    ) : (selectedTeam.memberships || []).map((m) => (
                                        <li key={m.userId} className="flex items-center justify-between py-3 first:pt-0">
                                            <div>
                                                <span className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                    {m.user?.name || m.user?.email || m.userId}
                                                </span>
                                                {m.user?.email && (
                                                    <span className={`ml-2 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                        {m.user.email}
                                                    </span>
                                                )}
                                                {m.role && (
                                                    <span className={`ml-2 text-xs px-2 py-0.5 rounded ${isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-600'}`}>
                                                        {m.role}
                                                    </span>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => removeMemberFromTeam(m.userId)}
                                                disabled={membersLoading}
                                                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                                                    isDark
                                                        ? 'text-red-400 hover:bg-gray-800'
                                                        : 'text-red-600 hover:bg-gray-100'
                                                }`}
                                            >
                                                Remove
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            );
                        })()}

                    </div>
                </div>
            )}

        </div>
    );
};

// Make available globally - don't wrap in memo as it may cause issues
window.Teams = Teams;
