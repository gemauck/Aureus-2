import {
    VALID_PAGES,
    PUBLIC_ROUTES,
    APP_SHELL_STANDALONE_PAGES,
    isMessengerPwaMode,
    canAccessErpCalendar,
    DESKTOP_SITE_LAYOUT_MIN_PX,
    getRouteSnapshot,
    resolveInitialPage,
    applyPageNavigation
} from './erpNavigationConfig.js';
import {
    filterMenuItemsForUser,
    partitionMenuItems,
    formatUserRoleLabel,
    readPreferDesktopLayout
} from './erpMenuConfig.js';
import ErpPageRenderer from './ErpPageRenderer.jsx';
import { getMainScrollClasses, getMainInnerClasses } from './erpPageRegistry.js';
import useErpLayoutComponents from './useErpLayoutComponents.jsx';

// Use React from window
if (window.debug && !window.debug.performanceMode) {
}
const { useState } = React;

const MainLayout = () => {
    // Load company name from settings
    const [companyName, setCompanyName] = React.useState('Abcotronics');
    
    React.useEffect(() => {
        // Load company name from settings
        const loadCompanyName = () => {
            if (window.getSystemSettings) {
                const settings = window.getSystemSettings();
                if (settings?.companyName) {
                    setCompanyName(settings.companyName);
                }
            } else {
                // Fallback to localStorage
                const stored = localStorage.getItem('systemSettings');
                if (stored) {
                    try {
                        const parsed = JSON.parse(stored);
                        if (parsed?.companyName) {
                            setCompanyName(parsed.companyName);
                        }
                    } catch (e) {
                        console.warn('Failed to parse settings:', e);
                    }
                }
            }
        };
        
        loadCompanyName();
        
        // Listen for settings changes
        const handleSettingsChange = (event) => {
            if (event.detail?.companyName) {
                setCompanyName(event.detail.companyName);
            }
        };
        
        window.addEventListener('systemSettingsChanged', handleSettingsChange);
        window.addEventListener('systemSettingsLoaded', handleSettingsChange);
        
        return () => {
            window.removeEventListener('systemSettingsChanged', handleSettingsChange);
            window.removeEventListener('systemSettingsLoaded', handleSettingsChange);
        };
    }, []);
    
    const getInitialPage = () => resolveInitialPage();

    const [currentPage, setCurrentPage] = useState(getInitialPage());
    const titleRequestRef = React.useRef(0);
    const titleCacheRef = React.useRef(new Map());

    // Ensure title helper is available (watch mode may load files lazily).
    React.useEffect(() => {
        if (window.PageTitleManager) {
            return;
        }
        const existing = document.getElementById('page-title-manager-script');
        if (existing) {
            return;
        }
        const script = document.createElement('script');
        script.id = 'page-title-manager-script';
        script.defer = true;
        script.src = '/dist/src/utils/pageTitle.js';
        document.body.appendChild(script);
    }, []);

    const syncDocumentTitle = React.useCallback(async (options = {}) => {
        const manager = window.PageTitleManager;
        if (!manager) {
            return;
        }

        const route = options.route || getRouteSnapshot();
        const routePage = (route?.page || currentPage || 'dashboard');
        const pageKey = String(routePage).toLowerCase();
        const pathname = String(window.location.pathname || '').toLowerCase();

        if (manager.setPublicTitle(pathname)) {
            return;
        }

        let entityName = manager.cleanEntityName(options.entityName || '');
        const entityId = Array.isArray(route?.segments) ? String(route.segments[0] || '') : '';

        if (!entityName && entityId) {
            const cacheKey = `${pageKey}:${entityId}`;
            if (titleCacheRef.current.has(cacheKey)) {
                entityName = titleCacheRef.current.get(cacheKey) || '';
            } else {
                const requestId = ++titleRequestRef.current;
                const resolved = await manager.resolveEntityNameByRoute(route);
                if (requestId !== titleRequestRef.current) {
                    return;
                }
                if (resolved) {
                    entityName = resolved;
                    titleCacheRef.current.set(cacheKey, resolved);
                }
            }
        }

        manager.setPageTitle({ page: routePage, entityName });
    }, [currentPage]);
    
    // Re-check route on mount if hash is present (for deep links from email)
    React.useEffect(() => {
        const hash = window.location.hash || '';
        if (hash.startsWith('#/')) {
            // Parse hash directly if RouteState not available
            const hashPath = hash.substring(2); // Remove '#/'
            const hashPathname = hashPath.split('?')[0]; // Remove query params
            const hashSegments = hashPathname.split('/').filter(Boolean);
            
            if (hashSegments.length > 0) {
                let pageFromHash = hashSegments[0];
                // Map 'crm' to 'clients' for backward compatibility
                if (pageFromHash === 'crm') {
                    pageFromHash = 'clients';
                }
                
                // If it's a valid page and not already set, update it
                if (VALID_PAGES.includes(pageFromHash) && currentPage !== pageFromHash) {
                    setCurrentPage(pageFromHash);
                }
            }
            
            // Also wait for RouteState to be ready and re-check
            let attempts = 0;
            const maxAttempts = 50; // 5 seconds
            const checkRoute = () => {
                attempts++;
                if (window.RouteState) {
                    const route = window.RouteState.getRoute();
                    if (route?.page && route.page !== currentPage) {
                        const page = route.page === 'crm' ? 'clients' : route.page;
                        if (VALID_PAGES.includes(page)) {
                            setCurrentPage(page);
                        }
                    }
                } else if (attempts < maxAttempts) {
                    // RouteState not ready yet, try again
                    setTimeout(checkRoute, 100);
                }
            };
            checkRoute();
        }
    }, []); // Run once on mount
    
    React.useEffect(() => {
        const routeState = window.RouteState;
        if (!routeState) {
            return;
        }

        // Guard to prevent infinite loops
        let isNavigating = false;
        let lastProcessedRoute = null;
        let lastLoggedPage = null;
        let navigationTimeout = null;
        let routeChangeCallCount = 0;
        const MAX_ROUTE_CHANGE_CALLS = 5; // Maximum calls per second

        const handleRouteChange = (route) => {
            // Prevent infinite loops by checking if we're already processing this route
            const routeKey = `${route?.page || 'dashboard'}-${JSON.stringify(route?.segments || [])}`;
            
            // Clear any pending navigation timeout
            if (navigationTimeout) {
                clearTimeout(navigationTimeout);
                navigationTimeout = null;
            }
            
            // Increment call count and reset after 1 second
            routeChangeCallCount++;
            setTimeout(() => {
                routeChangeCallCount = Math.max(0, routeChangeCallCount - 1);
            }, 1000);
            
            // If too many calls in quick succession, ignore
            if (routeChangeCallCount > MAX_ROUTE_CHANGE_CALLS) {
                console.warn('🚨 Too many route change calls detected, ignoring:', { routeKey, callCount: routeChangeCallCount });
                return;
            }
            
            if (isNavigating) {
                return;
            }
            
            // Prevent processing the same route twice in quick succession
            if (lastProcessedRoute === routeKey) {
                return;
            }

            let nextPage = route?.page || 'dashboard';
            const currentPath = window.location.pathname;
            const currentPage = currentPath.split('/').filter(Boolean)[0] || 'dashboard';

            if (isMessengerPwaMode()) {
                if (nextPage !== 'messages') {
                    isNavigating = true;
                    lastProcessedRoute = routeKey;
                    routeState.setPageSubpath('messages', [], { replace: true });
                    navigationTimeout = setTimeout(() => {
                        isNavigating = false;
                        lastProcessedRoute = null;
                    }, 500);
                    return;
                }
                lastProcessedRoute = routeKey;
                setCurrentPage('messages');
                return;
            }
            
            // Map 'crm' to 'clients' for backward compatibility
            if (nextPage === 'crm') {
                nextPage = 'clients';
                // Only update URL if we're not already on the correct path
                if (window.RouteState && currentPage !== 'clients') {
                    isNavigating = true;
                    lastProcessedRoute = routeKey;
                    window.RouteState.setPageSubpath('clients', route.segments || [], { replace: true });
                    // Reset flag after a longer delay to allow route change to complete
                    navigationTimeout = setTimeout(() => {
                        isNavigating = false;
                        lastProcessedRoute = null;
                    }, 500); // Increased to 500ms to match routeState.js lock duration
                    return; // Exit early, will be called again with new route
                }
            }
            
            if (!VALID_PAGES.includes(nextPage)) {
                const pathSeg = String(nextPage || '').toLowerCase();
                const pathnameNorm = (window.location.pathname || '').toLowerCase().replace(/\/+$/, '') || '/';
                const firstSeg = pathnameNorm.replace(/^\//, '').split('/')[0] || '';
                if (APP_SHELL_STANDALONE_PAGES.includes(pathSeg) || APP_SHELL_STANDALONE_PAGES.includes(firstSeg)) {
                    return;
                }
                const pathname = (window.location.pathname || '').toLowerCase();
                const isPublicRoute = PUBLIC_ROUTES.some(routePath => pathname.startsWith(routePath));
                if (!isPublicRoute) {
                    // Only navigate if we're not already on dashboard
                    if (currentPage !== 'dashboard' && currentPath !== '/') {
                        isNavigating = true;
                        lastProcessedRoute = routeKey;
                        routeState.setPageSubpath('dashboard', [], { replace: true, preserveSearch: false, preserveHash: false });
                        // Reset flag after a longer delay
                        navigationTimeout = setTimeout(() => {
                            isNavigating = false;
                            lastProcessedRoute = null;
                        }, 500); // Increased to 500ms to match routeState.js lock duration
                        return; // Exit early, will be called again with new route
                    }
                    setCurrentPage('dashboard');
                }
                return;
            }
            
            lastProcessedRoute = routeKey;
            setCurrentPage(nextPage);
            
            // Audit: log page/section view for "track every interaction" (once per main section)
            if (nextPage !== lastLoggedPage && window.AuditLogger && window.storage) {
                try {
                    const u = window.storage.getUser();
                    if (u && u.id && u.id !== 'system') {
                        const path = (route?.segments && route.segments.length)
                            ? `/${nextPage}/${route.segments.join('/')}` : `/${nextPage}`;
                        window.AuditLogger.log('view', nextPage, { path }, u);
                        lastLoggedPage = nextPage;
                    }
                } catch (e) {
                    // ignore
                }
            }
            
            // Check if route contains an entity ID and open it
            // Handle both simple URLs (/projects/123) and nested URLs (/projects/123/tasks/task456)
            if (route.segments && route.segments.length > 0 && window.EntityUrl) {
                // Build full path for parsing
                const fullPath = `/${nextPage}/${route.segments.join('/')}`;
                const parsed = window.EntityUrl.parseEntityUrl(fullPath);
                if (parsed) {
                    // OPTIMIZED: Dispatch immediately for tasks (no delay), use minimal delay for others
                    // Tasks need to open instantly, other entities can have a tiny delay for stability
                    const hasTask = route.search?.get('task') || parsed.options?.task;
                    const delay = hasTask ? 0 : 50; // No delay for tasks, 50ms for others
                    
                    if (delay === 0) {
                        // Immediate dispatch for tasks
                        window.dispatchEvent(new CustomEvent('openEntityDetail', {
                            detail: {
                                entityType: parsed.entityType,
                                entityId: parsed.entityId,
                                url: fullPath,
                                options: {
                                    ...parsed.options,
                                    // Parse query params for tab/section/task/siteId (client/lead site deep links)
                                    tab: route.search?.get('tab') || parsed.options?.tab,
                                    section: route.search?.get('section') || parsed.options?.section,
                                    commentId: route.search?.get('commentId') || parsed.options?.commentId,
                                    task: route.search?.get('task') || parsed.options?.task,
                                    siteId: route.search?.get('siteId') || parsed.options?.siteId
                                }
                            }
                        }));
                    } else {
                        // Small delay for non-task entities
                        setTimeout(() => {
                            window.dispatchEvent(new CustomEvent('openEntityDetail', {
                                detail: {
                                    entityType: parsed.entityType,
                                    entityId: parsed.entityId,
                                    url: fullPath,
                                    options: {
                                        ...parsed.options,
                                        // Parse query params for tab/section/task/siteId (client/lead site deep links)
                                        tab: route.search?.get('tab') || parsed.options?.tab,
                                        section: route.search?.get('section') || parsed.options?.section,
                                        commentId: route.search?.get('commentId') || parsed.options?.commentId,
                                        task: route.search?.get('task') || parsed.options?.task,
                                        siteId: route.search?.get('siteId') || parsed.options?.siteId
                                    }
                                }
                            }));
                        }, delay);
                    }
                }
            }
        };

        handleRouteChange(routeState.getRoute());
        
        // Check if current route contains an entity ID and open it
        const currentRoute = routeState.getRoute();
        if (currentRoute.segments && currentRoute.segments.length > 0) {
            // Check if this looks like an entity URL (supports nested URLs)
            if (window.EntityUrl) {
                const fullPath = `/${currentRoute.page}/${currentRoute.segments.join('/')}`;
                const parsed = window.EntityUrl.parseEntityUrl(fullPath);
                if (parsed) {
                    // Dispatch event to open entity
                    setTimeout(() => {
                        window.dispatchEvent(new CustomEvent('openEntityDetail', {
                            detail: {
                                entityType: parsed.entityType,
                                entityId: parsed.entityId,
                                url: fullPath,
                                options: {
                                    ...parsed.options,
                                    tab: currentRoute.search?.get('tab') || parsed.options?.tab,
                                    section: currentRoute.search?.get('section') || parsed.options?.section,
                                    commentId: currentRoute.search?.get('commentId') || parsed.options?.commentId,
                                    task: currentRoute.search?.get('task') || parsed.options?.task,
                                    siteId: currentRoute.search?.get('siteId') || parsed.options?.siteId
                                }
                            }
                        }));
                    }, 100);
                }
            }
        }
        
        const unsubscribe = routeState.subscribe(handleRouteChange);
        
        return () => {
            unsubscribe();
            if (navigationTimeout) {
                clearTimeout(navigationTimeout);
            }
        };
    }, []);

    React.useEffect(() => {
        const handleRouteChange = (event) => {
            const route = event?.detail || getRouteSnapshot();
            void syncDocumentTitle({ route });
        };

        const handleEntityNavigation = (event) => {
            const detail = event?.detail || {};
            const route = getRouteSnapshot();
            const suggestedName = detail.entityName || detail.name || detail.projectName || detail.clientName || '';
            const cleanName = window.PageTitleManager?.cleanEntityName?.(suggestedName) || '';
            const entityId = String(detail.entityId || route?.segments?.[0] || '');
            const pageKey = String(route?.page || currentPage || '').toLowerCase();
            if (cleanName && entityId) {
                titleCacheRef.current.set(`${pageKey}:${entityId}`, cleanName);
            }
            void syncDocumentTitle({ route, entityName: cleanName });
        };

        window.addEventListener('route:change', handleRouteChange);
        window.addEventListener('openEntityDetail', handleEntityNavigation);
        window.addEventListener('navigateToEntity', handleEntityNavigation);

        void syncDocumentTitle({ route: getRouteSnapshot() });

        return () => {
            window.removeEventListener('route:change', handleRouteChange);
            window.removeEventListener('openEntityDetail', handleEntityNavigation);
            window.removeEventListener('navigateToEntity', handleEntityNavigation);
        };
    }, [currentPage, syncDocumentTitle]);
    
    const [sidebarOpen, setSidebarOpen] = useState(false); // Start closed on mobile
    const [isMobile, setIsMobile] = useState(() =>
        typeof window !== 'undefined' ? window.innerWidth < 1024 : false
    );
    const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
    /** Mobile-friendly shell by default on phones; user can switch to desktop layout in theme → Layout */
    const [preferDesktopSite, setPreferDesktopSite] = useState(() => readPreferDesktopLayout());
    const effectiveIsMobile = isMobile && !preferDesktopSite;
    
    // Initialize mobile state on mount only and set initial sidebar state
    React.useEffect(() => {
        const width = window.innerWidth;
        const mobile = width < 1024;
        setIsMobile(mobile);
        setWindowWidth(width);
        
        const preferDesktop = readPreferDesktopLayout();
        const effectiveMobileShell = mobile && !preferDesktop;

        if (effectiveMobileShell) {
            setSidebarOpen(false); // Overlay sidebar: start closed
        } else {
            const manuallyCollapsed = localStorage.getItem('sidebarManuallyCollapsed') === 'true';
            setSidebarOpen(!manuallyCollapsed);
        }
    }, []); // Only run once on mount

    React.useEffect(() => {
        document.body.classList.add('erp-app');
        return () => document.body.classList.remove('erp-app');
    }, []);

    React.useEffect(() => {
        document.documentElement.classList.toggle('erp-desktop-site', preferDesktopSite);
    }, [preferDesktopSite]);

    /**
     * Wide meta viewport only on narrow devices when desktop layout is on — avoids forcing width=1330 on real desktops.
     * Pinch zoom allowed; lg breakpoints apply to the wide layout viewport on phones/tablets in desktop mode.
     */
    React.useEffect(() => {
        const meta = document.querySelector('meta[name="viewport"]');
        if (!meta) return undefined;
        const defaultContent =
            'width=device-width, initial-scale=1.0, minimum-scale=0.1, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover';
        const desktopSiteContent = `width=${DESKTOP_SITE_LAYOUT_MIN_PX}, initial-scale=1, minimum-scale=0.1, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover`;
        const useWideViewport = isMobile && preferDesktopSite;
        meta.setAttribute('content', useWideViewport ? desktopSiteContent : defaultContent);
        return () => {
            meta.setAttribute('content', defaultContent);
        };
    }, [preferDesktopSite, isMobile]);

    // Toggling “desktop site” on a narrow viewport switches shell between overlay and in-flow sidebar
    React.useEffect(() => {
        if (!isMobile) return;
        if (preferDesktopSite) {
            try {
                const manuallyCollapsed = localStorage.getItem('sidebarManuallyCollapsed') === 'true';
                setSidebarOpen(!manuallyCollapsed);
            } catch {
                setSidebarOpen(true);
            }
        } else {
            setSidebarOpen(false);
        }
    }, [preferDesktopSite, isMobile]);
    
    // Handle resize events separately to avoid conflicts
    React.useEffect(() => {
        const handleResize = () => {
            const width = window.innerWidth;
            const mobile = width < 1024;
            setWindowWidth(width);
            
            // If switching from desktop to mobile, close sidebar
            if (mobile && !isMobile) {
                setSidebarOpen(false);
            }
            
            setIsMobile(mobile);
        };
        
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [isMobile]);
    
    const [showThemeMenu, setShowThemeMenu] = useState(false);
    const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
    const [erpPwaInstallable, setErpPwaInstallable] = useState(
        () => window.pwaErpInstall?.canPromptErpPwaInstall?.() || false
    );
    const [erpPwaInstalled, setErpPwaInstalled] = useState(
        () => window.pwaErpInstall?.isErpPwaInstalled?.() || false
    );
    const [erpPwaInstallBusy, setErpPwaInstallBusy] = useState(false);
    const { user, logout } = window.useAuth();
    const { theme, toggleTheme, toggleSystemPreference, isFollowingSystem, systemPreference, isDark } = window.useTheme();
    

    // Update URL when page changes
    const navigateToPage = React.useCallback((page, options = {}) => {
        if (!page) {
            return;
        }
        applyPageNavigation(page, options);
        setCurrentPage(isMessengerPwaMode() && page !== 'messages' ? 'messages' : page);
    }, []);

    // Setup password change modal trigger
    React.useEffect(() => {
        window.triggerPasswordChangeModal = () => setShowPasswordChangeModal(true);
        window.closePasswordChangeModal = () => setShowPasswordChangeModal(false);
    }, []);

    React.useEffect(() => {
        const onInstallable = () => setErpPwaInstallable(true);
        const onInstalled = () => {
            setErpPwaInstalled(true);
            setErpPwaInstallable(false);
        };
        window.addEventListener('erp-pwa:installable', onInstallable);
        window.addEventListener('erp-pwa:installed', onInstalled);
        return () => {
            window.removeEventListener('erp-pwa:installable', onInstallable);
            window.removeEventListener('erp-pwa:installed', onInstalled);
        };
    }, []);

    const installErpDesktopApp = React.useCallback(async () => {
        const pwa = window.pwaErpInstall;
        if (!pwa || erpPwaInstallBusy) return;
        setErpPwaInstallBusy(true);
        try {
            if (pwa.isErpPwaEntry() && pwa.canPromptErpPwaInstall()) {
                await pwa.promptErpPwaInstall();
            } else {
                pwa.openErpPwaEntry();
            }
        } finally {
            setErpPwaInstallBusy(false);
        }
    }, [erpPwaInstallBusy]);

    // Close mobile menu when page changes
    React.useEffect(() => {
        if (effectiveIsMobile) {
            setSidebarOpen(false);
        }
    }, [currentPage, effectiveIsMobile]);

    // Listen for navigation events from child components
    React.useEffect(() => {
        const handleNavigate = (event) => {
            if (event.detail && event.detail.page) {
                const subpath = event.detail.subpath || [];
                navigateToPage(event.detail.page, { subpath });
            }
        };
        
        window.addEventListener('navigateToPage', handleNavigate);
        return () => window.removeEventListener('navigateToPage', handleNavigate);
    }, [navigateToPage]);

    React.useEffect(() => {
        if (!isMessengerPwaMode()) return;
        setCurrentPage('messages');
        if (window.RouteState) {
            const route = window.RouteState.getRoute();
            if (route?.page !== 'messages') {
                window.RouteState.setPageSubpath('messages', [], { replace: true });
            }
        } else if (!window.location.hash.includes('/messages')) {
            window.location.hash = '#/messages';
        }
    }, []);
    
    // Listen for entity navigation events
    React.useEffect(() => {
        const handleEntityNavigate = (event) => {
            if (!event.detail) return;
            if (isMessengerPwaMode()) return;

            const { entityType, entityId, url, options } = event.detail;
            if (!entityType || !entityId) return;
            
            // Navigate to the page first
            if (window.RouteState) {
                const parsed = window.EntityUrl?.parseEntityUrl(url);
                if (parsed) {
                    navigateToPage(parsed.page, [parsed.entityId]);
                }
            }
            
            // Dispatch event to open entity detail view
            // Components like Clients, Projects will listen for this
            window.dispatchEvent(new CustomEvent('openEntityDetail', {
                detail: {
                    entityType,
                    entityId,
                    options: options || {}
                }
            }));
        };
        
        window.addEventListener('navigateToEntity', handleEntityNavigate);
        return () => window.removeEventListener('navigateToEntity', handleEntityNavigate);
    }, []);

    // Close theme menu when clicking outside
    React.useEffect(() => {
        const handleClickOutside = (event) => {
            if (showThemeMenu && !event.target.closest('.theme-selector')) {
                setShowThemeMenu(false);
            }
        };
        
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [showThemeMenu]);

    const {
        Dashboard,
        ErrorBoundary,
        getClientsComponent,
        mainClientsAvailable,
        notificationCenterReady,
        messageCenterReady,
        TaskManagementComponent,
        MyNotesComponent,
        Projects,
        Teams,
        Messenger,
        Users,
        TimeTracking,
        Manufacturing,
        ServiceAndMaintenance,
        Helpdesk,
        Tools,
        Reports,
        Settings,
        Account,
        LeavePlatform,
        erpCalendarReady,
        PasswordChangeModal,
    } = useErpLayoutComponents({ effectiveIsMobile, isDark });

    const [refreshingRole, setRefreshingRole] = React.useState(false);

    const permissionChecker = React.useMemo(() => {
        if (!user || !window.PermissionChecker) return null;
        return new window.PermissionChecker(user);
    }, [user]);

    const menuItems = React.useMemo(() => {
        const hasUser = !!user && user !== null && user !== undefined;
        
        if (hasUser && !user.role && window.useAuth && !refreshingRole) {
            const { refreshUser } = window.useAuth();
            if (refreshUser) {
                setRefreshingRole(true);
                refreshUser().then((refreshedUser) => {
                    if (refreshedUser?.role) {
                    }
                    setTimeout(() => setRefreshingRole(false), 3000);
                }).catch(() => {
                    setTimeout(() => setRefreshingRole(false), 3000);
                });
            }
        }
        
        return filterMenuItemsForUser(user, permissionChecker);
    }, [user?.role, user?.id, user?.email, refreshingRole, permissionChecker]);

    const {
        myTasksMenuItem,
        myNotesMenuItem,
        messagesMenuItem,
        primaryMenuItems
    } = React.useMemo(() => partitionMenuItems(menuItems), [menuItems]);

    const isAdmin = React.useMemo(() => {
        return typeof window.isAdminRole === 'function' && window.isAdminRole(user?.role);
    }, [user?.role]);

    React.useEffect(() => {
        if (isMessengerPwaMode()) {
            if (currentPage !== 'messages') {
                setCurrentPage('messages');
            }
            return;
        }

        const userRole = user?.role?.toLowerCase();
        
        // Check permissions for admin-only pages
        if (permissionChecker && window.PERMISSIONS) {
            if (currentPage === 'users') {
                if (!permissionChecker.hasPermission(window.PERMISSIONS.ACCESS_USERS)) {
                    console.warn(`Access denied: Users page requires admin access`);
                    navigateToPage('dashboard');
                    return;
                }
            }
        } else {
            // Fallback: use role-based check if PermissionChecker not available
            if (currentPage === 'users' && !isAdmin) {
                console.warn(`Access denied: ${currentPage} page requires admin role`);
                navigateToPage('dashboard');
                return;
            }
        }
        
        // Guest users can only access Projects
        if (userRole === 'guest' && currentPage !== 'projects') {
            console.warn(`Access denied: Guest users can only access Projects`);
            navigateToPage('projects');
            return;
        }

        if (currentPage === 'erp-calendar' && user && !canAccessErpCalendar(user)) {
            navigateToPage('dashboard');
        }
    }, [currentPage, isAdmin, user?.role, user?.email, user, permissionChecker, navigateToPage]);

    const renderPage = React.useMemo(() => {
        try {
            return (
                <ErpPageRenderer
                    currentPage={currentPage}
                    ErrorBoundary={ErrorBoundary}
                    user={user}
                    isAdmin={isAdmin}
                    isDark={isDark}
                    permissionChecker={permissionChecker}
                    erpCalendarReady={erpCalendarReady}
                    getClientsComponent={getClientsComponent}
                    components={{
                        Dashboard,
                        Projects,
                        Teams,
                        Messenger,
                        Users,
                        Account,
                        TimeTracking,
                        LeavePlatform,
                        Manufacturing,
                        ServiceAndMaintenance,
                        Helpdesk,
                        Tools,
                        Reports,
                        TaskManagementComponent,
                        MyNotesComponent,
                        Settings,
                    }}
                />
            );
        } catch (error) {
            console.error('❌ MainLayout: Error rendering page:', error);
            return (
                <div key="error" className="bg-red-50 border border-red-200 rounded-lg p-6">
                    <h2 className="text-lg font-semibold text-red-800 mb-2">Error Loading Page</h2>
                    <p className="text-sm text-red-600 mb-3">There was an error loading the {currentPage} page.</p>
                    <p className="text-xs text-red-500 mb-4">Error: {error.message}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 text-sm font-medium"
                    >
                        Reload Page
                    </button>
                </div>
            );
        }
    }, [currentPage, Dashboard, Projects, Teams, Messenger, Users, Account, TimeTracking, LeavePlatform, Manufacturing, ServiceAndMaintenance, Helpdesk, Tools, Reports, TaskManagementComponent, MyNotesComponent, Settings, ErrorBoundary, isAdmin, getClientsComponent, mainClientsAvailable, permissionChecker, erpCalendarReady, user, isDark]);

    React.useEffect(() => {
        window.currentPage = currentPage;
        return () => {
            delete window.currentPage;
        };
    }, [currentPage]);

    const preloadMessenger = React.useCallback(() => {
        if (window.Messenger) return;
        const v = window.BUILD_VERSION || Date.now();
        const s = document.createElement('script');
        s.src = `/dist/src/components/messages/Messenger.js?v=${encodeURIComponent(v)}`;
        document.head.appendChild(s);
    }, []);

    const renderMenuButton = (item, extraClasses = '') => (
        <button
            key={item.id}
            onMouseEnter={item.id === 'messages' ? preloadMessenger : undefined}
            onFocus={item.id === 'messages' ? preloadMessenger : undefined}
            onClick={() => {
                // Always navigate to base page (no subpath) when clicking a menu item
                // This ensures clicking "Projects" while viewing a project detail navigates back to projects list
                // Even if already on the same page, navigate to clear any segments/subpaths
                navigateToPage(item.id, { subpath: [] });
                
                // If clicking on Projects while already on projects page, dispatch event to clear project detail view
                if (item.id === 'projects' && currentPage === 'projects') {
                    // Dispatch a custom event that Projects component can listen to
                    window.dispatchEvent(new CustomEvent('navigateToProjectsList', {
                        detail: { clearProjectDetail: true }
                    }));
                }
                
                if (effectiveIsMobile) {
                    setSidebarOpen(false);
                }
            }}
            className={`w-full flex items-center relative ${
                sidebarOpen
                    ? `${effectiveIsMobile ? 'px-4 py-2.5 mx-0 my-0.5' : 'px-5 py-2.5 mx-2 my-1'} space-x-3 rounded-xl justify-start text-left`
                    : 'px-3 py-2.5 mx-2 my-1 justify-center rounded-xl'
            } transition-all duration-200 ${
                currentPage === item.id 
                    ? isDark
                        ? 'bg-gray-800 text-white shadow-sm ring-1 ring-slate-500/50'
                        : 'bg-blue-50 text-blue-900 shadow-sm ring-1 ring-slate-200/90'
                    : isDark 
                        ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/80' 
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/80'
            } ${extraClasses}`}
            title={!sidebarOpen ? item.label : ''}
        >
            <i className={`fas ${item.icon} ${sidebarOpen ? 'text-base' : 'text-lg'} ${currentPage === item.id ? (isDark ? 'text-blue-300' : 'text-blue-700') : 'opacity-70'}`}></i>
            {sidebarOpen && (
                <span className={`text-base font-medium flex-1 flex items-center justify-between gap-2 ${currentPage === item.id ? '' : 'font-normal'}`}>
                    <span>{item.label}</span>
                    {item.id === 'messages' && chatUnread > 0 && (
                        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                            {chatUnread > 99 ? '99+' : chatUnread}
                        </span>
                    )}
                </span>
            )}
            {!sidebarOpen && item.id === 'messages' && chatUnread > 0 && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-gray-900" />
            )}
        </button>
    );

    if (isMessengerPwaMode()) {
        return (
            <div className={`flex h-screen flex-col overflow-hidden ${isDark ? 'bg-gray-950' : 'bg-[#f0f4f8]'}`}>
                <header
                    className={`erp-messenger-pwa-header flex h-10 shrink-0 items-center justify-between px-3 sm:px-4 ${
                        isDark ? 'border-b border-gray-800 bg-gray-900/95' : 'border-b border-gray-200 bg-white/95'
                    }`}
                >
                    <div className="flex min-w-0 items-center gap-2">
                        <i className="fas fa-comments text-blue-500 text-sm" aria-hidden="true" />
                        <span className={`truncate text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                            Abcotronics Messenger
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={toggleTheme}
                            className={`${isDark ? 'text-gray-400 hover:bg-gray-800 hover:text-gray-200' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'} flex h-8 w-8 items-center justify-center rounded-lg transition-colors`}
                            title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
                        >
                            <i className={`fas fa-${isDark ? 'sun' : 'moon'} text-sm`} />
                        </button>
                        <button
                            type="button"
                            onClick={logout}
                            className={`${isDark ? 'text-gray-400 hover:bg-gray-800 hover:text-gray-200' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'} flex h-8 w-8 items-center justify-center rounded-lg transition-colors`}
                            title="Log out"
                        >
                            <i className="fas fa-sign-out-alt text-sm" />
                        </button>
                    </div>
                </header>
                <main className="min-h-0 flex-1 overflow-hidden">
                    <ErrorBoundary key="messages-pwa">
                        <Messenger />
                    </ErrorBoundary>
                </main>
                {PasswordChangeModal && showPasswordChangeModal && <PasswordChangeModal />}
            </div>
        );
    }

    /* Layout: effectiveIsMobile = width < 1024 && !preferDesktopSite; aligns with main.css max-width 1023px */
    return (
        <div 
            className={`flex h-screen overflow-hidden ${isMobile && preferDesktopSite ? 'overflow-x-auto' : 'overflow-x-hidden'} ${isDark ? 'bg-gray-950' : 'bg-[#f8fafc]'}`} 
            style={{ 
                ...(isMobile && preferDesktopSite
                    ? {
                        width: '100%',
                        minWidth: `${DESKTOP_SITE_LAYOUT_MIN_PX}px`,
                        maxWidth: 'none',
                        overflowX: 'auto',
                    }
                    : {
                        width: '100vw',
                        maxWidth: '100vw',
                        overflowX: 'hidden',
                    }),
                paddingTop: 'env(safe-area-inset-top)',
                paddingLeft: 'env(safe-area-inset-left)',
                paddingRight: 'env(safe-area-inset-right)',
                paddingBottom: 'env(safe-area-inset-bottom)',
                boxSizing: 'border-box',
            }}
        >
            {/* Mobile Sidebar Overlay - FIXED positioning */}
            {effectiveIsMobile && sidebarOpen && (
                <div 
                    className="fixed inset-0 bg-black bg-opacity-50 z-40"
                    onClick={() => setSidebarOpen(false)}
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
                />
            )}
            
            {/* Sidebar - FIXED on mobile, RELATIVE on desktop */}
            <div 
                data-theme={isDark ? 'dark' : 'light'}
                className={`
                    ${isDark ? 'bg-gray-900 border-r border-gray-800 shadow-xl shadow-black/20' : 'bg-white border-r border-gray-200/80 shadow-[4px_0_24px_-12px_rgba(15,23,42,0.06)]'} 
                    transition-all duration-300 flex flex-col
                    ${effectiveIsMobile ? 'fixed z-50 text-left items-stretch' : 'relative z-10'}
                    ${effectiveIsMobile ? 'main-layout-sidebar' : ''}
                    ${effectiveIsMobile ? (sidebarOpen ? 'sidebar-open' : 'sidebar-closed') : ''}
                `}
                style={{
                    // Mobile: Fixed positioning, slide in from left
                    ...(effectiveIsMobile ? {
                        position: 'fixed',
                        top: 0,
                        left: sidebarOpen ? 0 : '-280px',
                        height: '100vh',
                        width: '280px',
                        zIndex: 50,
                    } : {
                        // Desktop: Normal flow, variable width
                        position: 'relative',
                        width: sidebarOpen ? '260px' : '72px',
                        minWidth: sidebarOpen ? '260px' : '72px',
                        flexShrink: 0,
                    })
                }}
            >
                {/* Logo / mobile drawer header */}
                {effectiveIsMobile ? (
                    <div
                        className={`flex flex-col items-stretch gap-1 px-4 py-3 min-h-14 shrink-0 ${
                            isDark ? 'border-b border-gray-800' : 'border-b border-gray-200'
                        }`}
                    >
                        <button
                            type="button"
                            onClick={() => setSidebarOpen(false)}
                            className={`self-start ${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'} p-2 rounded-xl transition-all duration-200`}
                            aria-label="Close menu"
                        >
                            <i className="fas fa-times text-lg" />
                        </button>
                        <h1
                            className={`abcotronics-logo text-left text-base font-semibold tracking-tight truncate w-full ${
                                isDark ? 'text-gray-100' : 'text-gray-900'
                            }`}
                            title={companyName}
                        >
                            {companyName}
                        </h1>
                    </div>
                ) : (
                    <div
                        className={`h-16 flex items-center ${sidebarOpen ? 'justify-between px-5' : 'justify-center px-3'} ${
                            isDark ? 'border-b border-gray-800' : 'border-b border-gray-200'
                        }`}
                    >
                        {sidebarOpen && (
                            <h1
                                className={`abcotronics-logo font-semibold text-lg tracking-tight ${isDark ? 'text-gray-100' : 'text-gray-900'}`}
                            >
                                {companyName}
                            </h1>
                        )}
                        <button
                            type="button"
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            className={`${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'} p-2 rounded-xl transition-all duration-200`}
                            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
                        >
                            <i className={`fas fa-${sidebarOpen ? 'times' : 'bars'} text-lg`} />
                        </button>
                    </div>
                )}

                {/* Menu Items */}
                <nav className="flex-1 min-h-0 overflow-y-auto py-3 flex flex-col sidebar-scrollbar">
                    <div className="flex-1">
                        {primaryMenuItems.map((item) => renderMenuButton(item))}
                    </div>
                    {(myTasksMenuItem || myNotesMenuItem || messagesMenuItem) && (
                        <div className={`${isDark ? 'border-t border-slate-700' : 'border-t border-slate-200'} pt-2 mt-2`}>
                            {myTasksMenuItem && renderMenuButton(myTasksMenuItem)}
                            {myNotesMenuItem && renderMenuButton(myNotesMenuItem)}
                            {messagesMenuItem && renderMenuButton(messagesMenuItem)}
                        </div>
                    )}
                </nav>

                {/* User Profile */}
                <div
                    className={`${isDark ? 'border-t border-slate-700' : 'border-t border-slate-200'} p-3 ${
                        effectiveIsMobile ? 'text-left' : ''
                    }`}
                >
                    <div
                        className={`flex items-center ${
                            sidebarOpen
                                ? `gap-3 rounded-xl border p-2.5 ${effectiveIsMobile ? 'justify-start' : ''} ` +
                                  (isDark ? 'border-gray-700/80 bg-gray-800/40' : 'border-gray-200/90 bg-white/70 shadow-sm')
                                : 'justify-center'
                        }`}
                    >
                        <div
                            className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center font-semibold text-white text-base shadow-sm bg-gradient-to-br from-blue-500 to-blue-600`}
                        >
                            {user?.name?.charAt(0) || 'U'}
                        </div>
                        {sidebarOpen && (
                            <>
                                <div className="flex-1 min-w-0 text-left">
                                    <p className={`text-base font-medium ${isDark ? 'text-gray-200' : 'text-gray-900'} truncate`}>
                                        {user?.name}
                                    </p>
                                    <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-500'} truncate`}>
                                        {formatUserRoleLabel(user?.role)}
                                    </p>
                                </div>
                                {!effectiveIsMobile ? (
                                    <button
                                        type="button"
                                        onClick={logout}
                                        className={`shrink-0 ${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'} p-2 rounded-xl transition-all duration-200`}
                                        title="Logout"
                                    >
                                        <i className="fas fa-sign-out-alt text-base" />
                                    </button>
                                ) : null}
                            </>
                        )}
                    </div>
                </div>
            </div>
            
            {/* Main Content - constrained so no horizontal scroll */}
            <div className="flex-1 flex flex-col overflow-hidden overflow-x-hidden min-w-0" style={{ minWidth: 0, width: 'auto', maxWidth: '100%', flex: '1 1 0%', flexBasis: '0%', flexGrow: 1, flexShrink: 1 }}>
                {/* Header - STICKY on mobile */}
                <header 
                    className={`erp-app-header
                        ${isDark ? 'bg-gray-900/95 backdrop-blur-md border-b border-gray-800 shadow-lg shadow-black/10' : 'bg-white/90 backdrop-blur-md border-b border-gray-200/90 shadow-sm shadow-gray-900/5'} 
                        ${effectiveIsMobile ? 'min-h-10 h-auto py-0.5 px-2' : 'h-10 px-3 sm:px-4'}
                        flex items-center ${effectiveIsMobile ? '' : 'justify-between'} flex-shrink-0
                        relative z-40
                        ${effectiveIsMobile ? 'sticky top-0' : ''}
                    `}
                >
                    {(() => {
                        const themeMenuPanel = showThemeMenu ? (
                            <div className={`erp-theme-menu-panel absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-2rem)] ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white/95 backdrop-blur-md border-gray-200'} border rounded-2xl shadow-xl shadow-gray-900/10 ring-1 ring-black/5 z-50`}>
                                <div className="p-2">
                                    {isMobile && (
                                        <>
                                            <div className={`text-xs font-semibold uppercase ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-2 px-3`}>
                                                Layout
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const next = !preferDesktopSite;
                                                    setPreferDesktopSite(next);
                                                    try {
                                                        localStorage.setItem('erpPreferDesktopLayout', next ? 'true' : 'false');
                                                    } catch {
                                                        /* ignore */
                                                    }
                                                    setShowThemeMenu(false);
                                                }}
                                                className={`erp-theme-menu-item w-full text-left px-3 py-2 rounded-lg text-sm ${isDark ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-50 text-gray-700'} flex items-start gap-3 transition-colors`}
                                            >
                                                <i className={`fas fa-${preferDesktopSite ? 'mobile-alt' : 'desktop'} mt-0.5`}></i>
                                                <span className="leading-snug">
                                                    {preferDesktopSite
                                                        ? 'Switch to mobile layout (sidebar overlay, compact UI)'
                                                        : 'Switch to desktop layout (wide canvas, pan on small screens)'}
                                                </span>
                                            </button>
                                            <div className={`my-2 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`} />
                                        </>
                                    )}
                                    {!erpPwaInstalled ? (
                                        <>
                                            <div className={`text-xs font-semibold uppercase ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-2 px-3`}>
                                                Desktop app
                                            </div>
                                            <button
                                                type="button"
                                                disabled={erpPwaInstallBusy}
                                                onClick={() => {
                                                    setShowThemeMenu(false);
                                                    void installErpDesktopApp();
                                                }}
                                                className={`erp-theme-menu-item w-full text-left px-3 py-2 rounded-lg text-sm ${isDark ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-50 text-gray-700'} flex items-start gap-3 transition-colors disabled:opacity-50`}
                                            >
                                                <i className={`fas ${erpPwaInstallBusy ? 'fa-spinner fa-spin' : 'fa-download'} mt-0.5`}></i>
                                                <span className="leading-snug">
                                                    {window.__PWA_ERP_APP__ && erpPwaInstallable
                                                        ? 'Install ERP desktop app'
                                                        : 'Set up ERP desktop app'}
                                                </span>
                                            </button>
                                            <div className={`my-2 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`} />
                                        </>
                                    ) : null}
                                    <div className={`text-xs font-semibold uppercase ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-2 px-3`}>
                                        Mobile app
                                    </div>
                                    <a
                                        href={window.mobileAppDownload?.getDefaultAndroidApkUrl?.() || '/api/public/mobile-apk/download'}
                                        onClick={() => setShowThemeMenu(false)}
                                        className={`erp-theme-menu-item w-full text-left px-3 py-2 rounded-lg text-sm ${isDark ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-50 text-gray-700'} flex items-start gap-3 transition-colors`}
                                        download
                                    >
                                        <i className="fab fa-android mt-0.5" aria-hidden="true"></i>
                                        <span className="leading-snug">Download Android app</span>
                                    </a>
                                    <div className={`my-2 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`} />
                                    <div className={`text-xs font-semibold uppercase ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-2 px-3`}>
                                        Theme
                                    </div>
                                    <button
                                        onClick={() => {
                                            toggleTheme();
                                            setShowThemeMenu(false);
                                        }}
                                        className={`erp-theme-menu-item w-full text-left px-3 py-2 rounded-lg text-sm ${isDark ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-50 text-gray-700'} flex items-center space-x-3 transition-colors`}
                                    >
                                        <i className={`fas fa-${isDark ? 'sun' : 'moon'}`}></i>
                                        <span>Switch to {isDark ? 'Light' : 'Dark'}</span>
                                    </button>
                                    <button
                                        onClick={() => {
                                            toggleSystemPreference();
                                            setShowThemeMenu(false);
                                        }}
                                        className={`erp-theme-menu-item w-full text-left px-3 py-2 rounded-lg text-sm mt-1 ${isDark ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-50 text-gray-700'} flex items-center space-x-3 transition-colors`}
                                    >
                                        <i className={`fas fa-${isFollowingSystem ? 'check' : 'circle'}`}></i>
                                        <span>{isFollowingSystem ? 'Following' : 'Follow'} System</span>
                                    </button>
                                    {effectiveIsMobile ? (
                                        <>
                                            <div className={`my-2 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`} />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowThemeMenu(false);
                                                    logout();
                                                }}
                                                className={`erp-theme-menu-item w-full text-left px-3 py-2 rounded-lg text-sm ${isDark ? 'hover:bg-gray-700 text-red-300' : 'hover:bg-red-50 text-red-700'} flex items-center space-x-3 transition-colors`}
                                            >
                                                <i className="fas fa-sign-out-alt" />
                                                <span>Log out</span>
                                            </button>
                                        </>
                                    ) : null}
                                </div>
                            </div>
                        ) : null;

                        const mobileHeaderIconBtn = `${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/80' : 'text-gray-500 hover:text-gray-700 hover:bg-white/90'} flex !h-8 !min-h-8 !w-8 !min-w-8 shrink-0 items-center justify-center border-0 bg-transparent p-0 transition-colors`;

                        const androidApkUrl =
                            window.mobileAppDownload?.getDefaultAndroidApkUrl?.() ||
                            '/api/public/mobile-apk/download';
                        const showAndroidAppIcon = window.mobileAppDownload?.isAndroidBrowser?.() || false;

                        const androidAppButton = showAndroidAppIcon ? (
                            <a
                                href={androidApkUrl}
                                download
                                className={
                                    effectiveIsMobile
                                        ? `${mobileHeaderIconBtn} rounded-lg`
                                        : `${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100/90'} flex min-h-8 min-w-8 items-center justify-center rounded-lg p-1.5 transition-all duration-200`
                                }
                                title="Download Android app"
                                aria-label="Download Android app"
                            >
                                <i className="fab fa-android text-sm" aria-hidden="true"></i>
                            </a>
                        ) : null;

                        const settingsButton = (
                            <button
                                type="button"
                                onClick={() => navigateToPage('settings')}
                                className={
                                    effectiveIsMobile
                                        ? `${mobileHeaderIconBtn} rounded-none`
                                        : `${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100/90'} flex min-h-8 min-w-8 items-center justify-center rounded-lg p-1.5 transition-all duration-200`
                                }
                                title="Settings"
                            >
                                <i className="fas fa-cog text-sm"></i>
                            </button>
                        );

                        const themeSelector = (
                            <div className="relative theme-selector flex h-8 items-center">
                                <button
                                    type="button"
                                    className={
                                        effectiveIsMobile
                                            ? `${mobileHeaderIconBtn} rounded-none`
                                            : `${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100/90'} flex min-h-8 min-w-8 items-center justify-center rounded-lg p-1.5 transition-all duration-200`
                                    }
                                    onClick={() => setShowThemeMenu(!showThemeMenu)}
                                    title="Theme and layout"
                                >
                                    <i className={`fas fa-${isDark ? 'sun' : 'moon'} text-sm`}></i>
                                </button>
                                {themeMenuPanel}
                            </div>
                        );

                        const notificationsSlot = notificationCenterReady && window.NotificationCenter ? (
                            <div className="flex h-8 shrink-0 items-center justify-center [&_button.notification-button]:!h-8 [&_button.notification-button]:!min-h-8 [&_button.notification-button]:!w-8 [&_button.notification-button]:!min-w-8 [&_button.notification-button]:!max-h-8 [&_button.notification-button]:!max-w-8">
                                <window.NotificationCenter />
                            </div>
                        ) : null;

                        const messagesSlot = messageCenterReady && window.MessageCenter ? (
                            <div className="flex h-8 shrink-0 items-center justify-center [&_button.message-button]:!h-8 [&_button.message-button]:!min-h-8 [&_button.message-button]:!w-8 [&_button.message-button]:!min-w-8 [&_button.message-button]:!max-h-8 [&_button.message-button]:!max-w-8">
                                <window.MessageCenter />
                            </div>
                        ) : null;

                        if (effectiveIsMobile) {
                            return (
                                <div
                                    className={`erp-app-header-mobile-row flex h-9 w-full min-w-0 flex-nowrap items-center gap-1 rounded-lg border px-1.5 shadow-sm ${
                                        isDark ? 'border-gray-700/90 bg-gray-800/55' : 'border-gray-200 bg-white'
                                    }`}
                                >
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                                        <button
                                            type="button"
                                            onClick={() => setSidebarOpen(true)}
                                            className={`${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'} flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200`}
                                            aria-label="Open menu"
                                        >
                                            <i className="fas fa-bars text-lg leading-none"></i>
                                        </button>
                                    </div>
                                    <h1
                                        className={`abcotronics-logo min-w-0 flex-1 truncate text-center text-sm font-semibold leading-tight sm:text-base ${isDark ? 'text-gray-100' : 'text-gray-900'}`}
                                        title={companyName}
                                    >
                                        {companyName}
                                    </h1>
                                    <div className="flex h-8 shrink-0 flex-nowrap items-center gap-0.5">
                                        {androidAppButton}
                                        {messagesSlot}
                                        {notificationsSlot}
                                        <div
                                            className={`flex h-8 flex-nowrap items-center divide-x overflow-hidden rounded-md border ${
                                                isDark ? 'divide-gray-600 border-gray-600 bg-gray-900/70' : 'divide-gray-200 border-gray-200 bg-gray-50'
                                            }`}
                                        >
                                            {settingsButton}
                                            {themeSelector}
                                        </div>
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <>
                                <div className="flex min-w-0 flex-1 items-center gap-3 space-x-4">
                                    {window.GlobalSearch && (
                                        <window.GlobalSearch isMobile={false} isDark={isDark} />
                                    )}
                                </div>
                                <div className="flex items-center space-x-2">
                                    {androidAppButton}
                                    {messagesSlot}
                                    {notificationsSlot}
                                    {settingsButton}
                                    {themeSelector}
                                </div>
                            </>
                        );
                    })()}
                </header>

                {/* Page Content — mobile CRM uses inner scroll only so tabs/search are not in the same scrollport as the list (fixes content bleeding through sticky chrome). */}
                <main
                    id="main-page-scroll"
                    className={getMainScrollClasses(currentPage, { effectiveIsMobile, isDark })}
                    style={{ width: 'auto', maxWidth: '100%', minWidth: 0, flex: '1 1 0%', flexBasis: '0%', flexGrow: 1, flexShrink: 1 }}
                >
                    <div
                        className={getMainInnerClasses(currentPage, { effectiveIsMobile })}
                        style={{ width: '100%', maxWidth: '100%', minWidth: 0 }}
                    >
                        {renderPage}
                    </div>
                </main>
                
                {/* Global Feedback Widget */}
                {window.FeedbackWidget && <window.FeedbackWidget />}
                
                {/* Password Change Modal */}
                {PasswordChangeModal && showPasswordChangeModal && <PasswordChangeModal />}
            </div>
        </div>
    );
};

// Make available globally
try {
    window.MainLayout = MainLayout;
} catch (error) {
    console.error('❌ MainLayout-mobile-fixed.jsx: Error:', error);
}
