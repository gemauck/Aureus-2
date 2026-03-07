// Get dependencies from window (DiscussionModal, ManagementMeetingNotes read at load; TeamDiscussions read at render so lazy load works)
const { useState, useEffect, useMemo, useCallback, useRef } = React;
const storage = window.storage;
const DiscussionModal = window.DiscussionModal;
const ManagementMeetingNotes = window.ManagementMeetingNotes;

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
                
                const token = window.storage?.getToken?.() || localStorage.getItem('auth_token');
                if (!token) {
                    console.warn('Teams: No auth token available');
                    setTeamsLoading(false);
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
                    // Format teams to match expected structure
                    const formattedTeams = data.data.teams
                        .map(team => ({
                            id: team.id,
                            name: team.name,
                            icon: team.icon || '',
                            color: team.color || 'blue',
                            description: team.description || '',
                            members: team.members || 0,
                            permissions: team.permissions || [],
                            isActive: team.isActive !== false
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
    
    // Query params from search or from hash (#/teams/id?tab=discussions&discussion=id)
    const getSearchParams = () => {
        const hash = window.location.hash || '';
        if (hash.indexOf('?') !== -1) {
            return new URLSearchParams(hash.slice(hash.indexOf('?') + 1));
        }
        return new URLSearchParams(window.location.search);
    };

    // Initialize activeTab from URL or default to 'overview'
    const getTabFromURL = () => {
        const urlParams = getSearchParams();
        const tab = urlParams.get('tab') || 'overview';
        // Map legacy tabs to discussions
        if (['documents', 'workflows', 'checklists', 'notices'].includes(tab)) return 'discussions';
        if (['overview', 'discussions', 'meeting-notes', 'poa-review'].includes(tab)) return tab;
        return 'overview';
    };
    
    // ALL useState hooks must be declared before any useEffect hooks
    const [activeTab, setActiveTabState] = useState(getTabFromURL());
    
    // Ref to track current tab for async operations
    const activeTabRef = useRef(activeTab);
    useEffect(() => {
        activeTabRef.current = activeTab;
    }, [activeTab]);
    
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
    }, []);
    const [selectedTeam, setSelectedTeam] = useState(() => {
        // Initialize from URL if available (will be updated after teams load)
        // Return null initially - team will be set in useEffect after teams are loaded
        return null;
    });
    const [searchTerm, setSearchTerm] = useState('');
    const [isReady, setIsReady] = useState(false);
    
    // Track initial mount to avoid overwriting URL params on first load
    const isInitialMount = useRef(true);
    
    // Modal states
    // Discussions overview (for Recent Activity when no team selected)
    const [allDiscussions, setAllDiscussions] = useState([]);
    
    // State to track ManagementMeetingNotes availability
    const [managementMeetingNotesAvailable, setManagementMeetingNotesAvailable] = useState(false);
    // Force re-render when on discussions tab until lazy-loaded TeamDiscussions is available
    const [, setDiscussionsReadyTick] = useState(0);
    
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
        
        const url = new URL(window.location);
        
        if (selectedTeam?.id === 'management' && activeTab === 'meeting-notes') {
            url.searchParams.set('tab', 'meeting-notes');
            url.searchParams.set('team', 'management');
            // Preserve month and week params for meeting-notes
            // (month and week are managed by ManagementMeetingNotes component)
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

    // Check modal components on mount only
    useEffect(() => {
    }, []);

    // Wait for ManagementMeetingNotes component to load
    useEffect(() => {
        const checkForManagementMeetingNotes = () => {
            if (window.ManagementMeetingNotes) {
                setManagementMeetingNotesAvailable(true);
                return true;
            }
            return false;
        };

        // Check immediately
        if (checkForManagementMeetingNotes()) {
            return;
        }

        // Poll for the component (components load asynchronously)
        // Reduced polling frequency and max attempts for better performance
        let attempts = 0;
        const maxAttempts = 20; // 2 seconds max wait (reduced from 5 seconds)
        const interval = setInterval(() => {
            attempts++;
            if (checkForManagementMeetingNotes() || attempts >= maxAttempts) {
                clearInterval(interval);
                if (attempts >= maxAttempts) {
                    console.warn('⚠️ Teams: ManagementMeetingNotes component not found after waiting');
                }
            }
        }, 100);

        return () => clearInterval(interval);
    }, []);

    // When on discussions tab, re-render periodically until lazy-loaded TeamDiscussions is available
    useEffect(() => {
        if (activeTab !== 'discussions' || window.TeamDiscussions) return;
        const id = setInterval(() => setDiscussionsReadyTick((t) => t + 1), 300);
        return () => clearInterval(id);
    }, [activeTab]);

    // Load discussions for overview (Recent Activity) when no team selected
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                if (!window.dataService?.getTeamDiscussions) {
                    setIsReady(true);
                    return;
                }
                const list = await window.dataService.getTeamDiscussions();
                if (!cancelled) {
                    setAllDiscussions(Array.isArray(list) ? list : []);
                }
            } catch (e) {
                if (!cancelled) setAllDiscussions([]);
            } finally {
                if (!cancelled) setIsReady(true);
            }
        };
        load();
        return () => { cancelled = true; };
    }, []);

    // Team discussion counts from API (teams list includes counts.discussions)
    const getTeamCounts = useCallback((teamId) => {
        const team = teams.find(t => t.id === teamId);
        const discussions = team?.counts?.discussions ?? 0;
        return { discussions };
    }, [teams]);

    // Recent activity from discussions
    const recentActivity = useMemo(() => {
        return (allDiscussions || [])
            .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
            .slice(0, 10)
            .map(d => ({
                ...d,
                title: d.title,
                type: d.type === 'notice' ? 'notice' : 'discussion',
                icon: d.type === 'notice' ? 'bullhorn' : 'comments',
                teamId: d.teamId,
                team: d.team?.id || d.teamId,
                createdAt: d.createdAt,
                updatedAt: d.updatedAt
            }));
    }, [allDiscussions]);

    useEffect(() => {
        if (selectedTeam && !isTeamAccessible(selectedTeam.id)) {
            setSelectedTeam(null);
            setActiveTab('overview');
        }
    }, [selectedTeam, isTeamAccessible]);

    const handleSelectTeam = useCallback((team) => {
        if (!isTeamAccessible(team.id)) {
            if (typeof window.alert === 'function') {
                window.alert('Only administrators can access the Management team.');
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
            <div className="space-y-6">
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
        <div className="space-y-6">
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
                                    placeholder="Search discussions…"
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
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Overview - All Teams Grid */}
            {!selectedTeam && (
                <div className="space-y-6">
                    {/* Quick Stats */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                        <div className={`rounded-xl border p-4 shadow-sm ${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'}`}>
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className={`text-xs mb-0.5 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Total Discussions</p>
                                    <p className={`text-xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                        {teams.reduce((sum, t) => sum + (t.counts?.discussions ?? 0), 0)}
                                    </p>
                                </div>
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
                                    <i className={`fas fa-comments ${isDark ? 'text-blue-400' : 'text-blue-600'} text-sm`}></i>
                                </div>
                            </div>
                        </div>
                    </div>

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
                                            <span><i className="fas fa-comments mr-1"></i>{counts.docussions}</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Recent Activity */}
                    <div className={`rounded-xl border p-5 shadow-sm ${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'}`}>
                        <h2 className={`text-sm font-semibold mb-4 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Recent Activity</h2>
                        {recentActivity.length > 0 ? (
                            <div className={`divide-y ${isDark ? 'divide-gray-800' : 'divide-gray-200'}`}>
                                {recentActivity.map((item, idx) => {
                                    const team = teams.find(t => t.id === (item.teamId || item.team));
                                    return (
                                        <div key={idx} className="flex items-center gap-3 py-3 first:pt-0">
                                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
                                                <i className={`fas fa-${item.icon} text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}></i>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm font-medium truncate ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{item.title}</p>
                                                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                    {team?.name} • {item.type}
                                                </p>
                                            </div>
                                            <span className={`text-xs whitespace-nowrap ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                {new Date(item.createdAt || item.updatedAt || item.date).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' })}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-10">
                                <i className={`fas fa-history text-3xl mb-2 ${isDark ? 'text-gray-600' : 'text-gray-300'}`}></i>
                                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>No activity yet</p>
                            </div>
                        )}
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
                        {activeTab === 'meeting-notes' && selectedTeam?.id === 'management' && (() => {
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

                    </div>
                </div>
            )}

        </div>
    );
};

// Make available globally - don't wrap in memo as it may cause issues
window.Teams = Teams;
