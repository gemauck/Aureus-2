// Use React from window
if (window.debug && !window.debug.performanceMode) {
    console.log('🔍 MainLayout.jsx: Script is executing...');
}
const { useState } = React;

const MainLayout = () => {
    // Initialize currentPage to dashboard on refresh
    const getPageFromURL = () => {
        // Always return dashboard on refresh/initial load
        return 'dashboard';
    };

    const [currentPage, setCurrentPage] = useState(getPageFromURL());
    
    // Update URL to root on initial load to ensure refresh always goes to dashboard
    React.useEffect(() => {
        if (window.location.pathname !== '/') {
            window.history.replaceState({ page: 'dashboard' }, '', '/');
        }
    }, []);
    const [sidebarOpen, setSidebarOpen] = useState(false); // Start closed on mobile
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    
    // Track mobile state
    React.useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 1024);
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);
    
    // Auto-expand sidebar text when mobile menu opens
    React.useEffect(() => {
        if (mobileMenuOpen && isMobile) {
            setSidebarOpen(true);
        }
    }, [mobileMenuOpen, isMobile]);
    const [showThemeMenu, setShowThemeMenu] = useState(false);
    const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
    const [showSettingsPortal, setShowSettingsPortal] = useState(false);
    const { user, logout } = window.useAuth();
    const { theme, toggleTheme, toggleSystemPreference, isFollowingSystem, systemPreference, isDark } = window.useTheme();
    
    // Debug user object immediately
    React.useEffect(() => {
        console.error('🚨 DEBUG: MainLayout user object:', {
            user,
            userType: typeof user,
            userIsNull: user === null,
            userIsUndefined: user === undefined,
            hasUser: !!user,
            userId: user?.id,
            userEmail: user?.email,
            userName: user?.name,
            userRole: user?.role,
            userRoleLower: user?.role?.toLowerCase(),
            userKeys: user ? Object.keys(user) : [],
            userStringified: JSON.stringify(user)
        });
    }, [user]);

    // Update URL when page changes
    const navigateToPage = (page) => {
        setCurrentPage(page);
        const newUrl = page === 'dashboard' ? '/' : `/${page}`;
        window.history.pushState({ page }, '', newUrl);
    };

    // Handle browser back/forward buttons
    React.useEffect(() => {
        const handlePopState = (event) => {
            console.log('🔄 MainLayout: Browser navigation:', event.state);
            if (event.state && event.state.page) {
                setCurrentPage(event.state.page);
            } else {
                const page = getPageFromURL();
                setCurrentPage(page);
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    // Setup password change modal trigger
    React.useEffect(() => {
        window.triggerPasswordChangeModal = () => setShowPasswordChangeModal(true);
        window.closePasswordChangeModal = () => setShowPasswordChangeModal(false);
    }, []);

    // Auto-close sidebar on mobile when page changes
    React.useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth < 1024) {
                setSidebarOpen(false);
            } else {
                setSidebarOpen(true);
            }
        };
        
        handleResize(); // Set initial state
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Close mobile menu when page changes
    React.useEffect(() => {
        setMobileMenuOpen(false);
    }, [currentPage]);

    // Listen for navigation events from child components
    React.useEffect(() => {
        const handleNavigate = (event) => {
            if (event.detail && event.detail.page) {
                navigateToPage(event.detail.page);
            }
        };
        
        window.addEventListener('navigateToPage', handleNavigate);
        return () => window.removeEventListener('navigateToPage', handleNavigate);
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

    // Get components from window - use useMemo to re-check on each render in case components load lazily
    const Dashboard = React.useMemo(() => {
        return window.DashboardLive || window.DashboardDatabaseFirst || window.DashboardSimple || window.DashboardFallback || window.Dashboard || (() => <div className="text-center py-12 text-gray-500">Dashboard loading...</div>);
    }, []); // Only compute once, components should be available by render time
    
    const ErrorBoundary = React.useMemo(() => {
        return window.ErrorBoundary || (({ children }) => children);
    }, []);
    
    // Clients component - use state to re-check when component becomes available (lazy loaded)
    const [clientsComponentReady, setClientsComponentReady] = React.useState(false);
    
    React.useEffect(() => {
        // Check if Clients component is available
        const checkClients = () => {
            const ClientsComponent = window.Clients || window.ClientsSimple;
            // Accept both regular functions and React.memo components
            const isValidComponent = ClientsComponent && (
                typeof ClientsComponent === 'function' || 
                (typeof ClientsComponent === 'object' && ClientsComponent.$$typeof)
            );
            if (isValidComponent) {
                if (!clientsComponentReady) {
                    console.log('✅ MainLayout: Clients component became available', ClientsComponent);
                    setClientsComponentReady(true);
                }
                return true;
            }
            return false;
        };
        
        // Check immediately
        if (checkClients()) {
            return; // Component already available, no need to poll
        }
        
        // Also listen for when Clients component registers itself (set up listener FIRST)
        const handleClientsAvailable = () => {
            if (checkClients()) {
                window.removeEventListener('clientsComponentReady', handleClientsAvailable);
            }
        };
        window.addEventListener('clientsComponentReady', handleClientsAvailable);
        
        // Also check if event was already fired (component loaded before listener)
        if (window._clientsComponentReady) {
            checkClients();
        }
        
        // Re-check periodically until component is available
        const interval = setInterval(() => {
            if (!clientsComponentReady) {
                checkClients();
            } else {
                clearInterval(interval);
            }
        }, 200); // Check even more frequently
        
        // Cleanup after 20 seconds to avoid infinite checking
        const timeout = setTimeout(() => {
            clearInterval(interval);
            window.removeEventListener('clientsComponentReady', handleClientsAvailable);
            if (!clientsComponentReady) {
                console.warn('⚠️ MainLayout: Clients component did not load within 20 seconds');
            }
        }, 20000);
        
        return () => {
            clearInterval(interval);
            clearTimeout(timeout);
            window.removeEventListener('clientsComponentReady', handleClientsAvailable);
        };
    }, [clientsComponentReady]);
    
    const Clients = React.useMemo(() => {
        return window.Clients || window.ClientsSimple || (() => <div className="text-center py-12 text-gray-500">Clients loading...</div>);
    }, [clientsComponentReady]); // Re-compute when component becomes ready
    
    const Pipeline = React.useMemo(() => {
        return window.Pipeline;
    }, []);
    
    // Projects component - use state to re-check when component becomes available
    const [projectsComponentReady, setProjectsComponentReady] = React.useState(false);
    
    React.useEffect(() => {
        // Check if Projects component is available
        const checkProjects = () => {
            const ProjectsComponent = window.Projects || window.ProjectsDatabaseFirst || window.ProjectsSimple;
            if (ProjectsComponent && !projectsComponentReady) {
                console.log('✅ MainLayout: Projects component became available');
                setProjectsComponentReady(true);
            }
        };
        
        // Check immediately
        checkProjects();
        
        // Also check periodically in case component loads after initial render
        const interval = setInterval(checkProjects, 500);
        const timeout = setTimeout(() => clearInterval(interval), 10000); // Stop checking after 10 seconds
        
        return () => {
            clearInterval(interval);
            clearTimeout(timeout);
        };
    }, [projectsComponentReady]);
    
    const Projects = React.useMemo(() => {
        const ProjectsComponent = window.Projects || window.ProjectsDatabaseFirst || window.ProjectsSimple;
        if (ProjectsComponent) {
            return ProjectsComponent;
        }
        return () => <div className="text-center py-12 text-gray-500">Projects loading...</div>;
    }, [projectsComponentReady]); // Re-compute when component becomes available
    // Use main Teams component first, fallback to TeamsSimple only if needed
    const Teams = window.Teams || window.TeamsSimple || (() => <div className="text-center py-12 text-gray-500">Teams module loading...</div>);
    const Users = window.UserManagement || window.Users || (() => {
        console.warn('⚠️ MainLayout: Users component not found. window.UserManagement:', typeof window.UserManagement, 'window.Users:', typeof window.Users);
        return <div className="text-center py-12 text-gray-500">Users component loading...</div>;
    });
    
    // Log component availability on mount (only in debug mode)
    React.useEffect(() => {
        if (window.debug && !window.debug.performanceMode) {
            console.log('🔍 MainLayout: Users component check', {
                hasUserManagement: typeof window.UserManagement !== 'undefined',
                hasUsers: typeof window.Users !== 'undefined',
                currentUser: user,
                userRole: user?.role
            });
        }
    }, []);
    const PasswordChangeModal = window.PasswordChangeModal;
    const TimeTracking = window.TimeTracking || window.TimeTrackingDatabaseFirst || (() => <div className="text-center py-12 text-gray-500">Time Tracking loading...</div>);
    const HR = window.HR || (() => <div className="text-center py-12 text-gray-500">HR loading...</div>);
    const Manufacturing = window.Manufacturing || (() => {
        console.warn('⚠️ Manufacturing component not loaded yet. window.Manufacturing:', typeof window.Manufacturing);
        return <div className="text-center py-12 text-gray-500">Manufacturing loading... (Check console for errors)</div>;
    });
    const Tools = window.Tools || (() => <div className="text-center py-12 text-gray-500">Tools loading...</div>);
    const Reports = window.Reports || (() => <div className="text-center py-12 text-gray-500">Reports loading...</div>);
    const Settings = window.Settings || (() => <div className="text-center py-12 text-gray-500">Settings loading...</div>);
    const Account = window.Account || (() => <div className="text-center py-12 text-gray-500">Account loading...</div>);

    // Filter menu items based on user role
    const allMenuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: 'fa-th-large' },
        { id: 'clients', label: 'CRM', icon: 'fa-users' },
        { id: 'projects', label: 'Projects', icon: 'fa-project-diagram' },
        { id: 'teams', label: 'Teams', icon: 'fa-user-friends' },
        { id: 'users', label: 'Users', icon: 'fa-user-cog', adminOnly: true },
        { id: 'hr', label: 'HR', icon: 'fa-id-card', adminOnly: true },
        { id: 'manufacturing', label: 'Manufacturing', icon: 'fa-industry' },
        { id: 'tools', label: 'Tools', icon: 'fa-toolbox' },
        { id: 'documents', label: 'Documents', icon: 'fa-folder-open' },
        { id: 'reports', label: 'Reports', icon: 'fa-chart-bar' },
    ];

    // Filter menu items based on user role (admin-only items)
    // Track if we're waiting for role refresh (to allow temporary access)
    const [refreshingRole, setRefreshingRole] = React.useState(false);
    
    const menuItems = React.useMemo(() => {
        const userRole = user?.role?.toLowerCase();
        // Check if user exists - user object might exist even without id/email initially
        const hasUser = !!user && user !== null && user !== undefined;
        
        // If user exists but doesn't have a role yet, try to refresh from API
        if (hasUser && !user.role && window.useAuth && !refreshingRole) {
            const { refreshUser } = window.useAuth();
            if (refreshUser) {
                console.log('🔄 User missing role, refreshing from API...');
                setRefreshingRole(true);
                refreshUser().then((refreshedUser) => {
                    if (refreshedUser?.role) {
                        console.log('✅ Role refreshed:', refreshedUser.role);
                    }
                    // Stop allowing fallback after 3 seconds
                    setTimeout(() => setRefreshingRole(false), 3000);
                }).catch(() => {
                    setTimeout(() => setRefreshingRole(false), 3000);
                });
            }
        }
        
        const filtered = allMenuItems.filter(item => {
            if (item.adminOnly) {
                // Strict admin-only access - no fallbacks
                return userRole === 'admin';
            }
            return true;
        });
        
        // Log only if Users menu visibility changes for debugging
        const hasUsersMenu = filtered.some(i => i.id === 'users');
        if (hasUsersMenu && userRole !== 'admin') {
            console.warn('⚠️ WARNING: Users menu visible but user is not admin!', { userRole, hasUsersMenu });
        }
        
        return filtered;
    }, [user?.role, user?.id, user?.email, refreshingRole]);

    // Check if user is admin (case-insensitive) - strict check, no fallbacks
    const isAdmin = React.useMemo(() => {
        const userRole = user?.role?.toLowerCase();
        return userRole === 'admin';
    }, [user?.role]);

    // Redirect non-admin users away from admin-only pages
    React.useEffect(() => {
        if ((currentPage === 'users' || currentPage === 'hr') && !isAdmin) {
            console.warn(`Access denied: ${currentPage} page requires admin role`);
            navigateToPage('dashboard');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPage, isAdmin]);

    // Memoize the render function to prevent unnecessary re-renders
    const renderPage = React.useMemo(() => {
        try {
            switch(currentPage) {
                case 'dashboard': 
                    return <ErrorBoundary key="dashboard"><Dashboard /></ErrorBoundary>;
                case 'clients': 
                    return <ErrorBoundary key="clients"><Clients /></ErrorBoundary>;
                case 'projects': 
                    return <ErrorBoundary key="projects"><Projects /></ErrorBoundary>;
                case 'teams': 
                    return <ErrorBoundary key="teams"><Teams /></ErrorBoundary>;
                case 'users': 
                    // Additional check before rendering (in case redirect didn't fire yet)
                    if (!isAdmin) {
                        return (
                            <div key="users-access-denied" className="flex items-center justify-center min-h-[400px]">
                                <div className="text-center">
                                    <i className="fas fa-lock text-4xl text-gray-400 mb-4"></i>
                                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Access Denied</h2>
                                    <p className="text-gray-600 dark:text-gray-400">You need administrator privileges to access this page.</p>
                                </div>
                            </div>
                        );
                    }
                    return <ErrorBoundary key="users"><Users /></ErrorBoundary>;
                case 'account': 
                    return <ErrorBoundary key="account"><Account /></ErrorBoundary>;
                case 'time': 
                    return <ErrorBoundary key="time"><TimeTracking /></ErrorBoundary>;
                case 'hr': 
                    // Additional check before rendering (in case redirect didn't fire yet)
                    if (!isAdmin) {
                        return (
                            <div key="hr-access-denied" className="flex items-center justify-center min-h-[400px]">
                                <div className="text-center">
                                    <i className="fas fa-lock text-4xl text-gray-400 mb-4"></i>
                                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Access Denied</h2>
                                    <p className="text-gray-600 dark:text-gray-400">You need administrator privileges to access the HR page.</p>
                                </div>
                            </div>
                        );
                    }
                    return <ErrorBoundary key="hr"><HR /></ErrorBoundary>;
                case 'manufacturing': 
                    return <ErrorBoundary key="manufacturing"><Manufacturing /></ErrorBoundary>;
                case 'tools': 
                    return <ErrorBoundary key="tools"><Tools /></ErrorBoundary>;
                case 'reports': 
                    return <ErrorBoundary key="reports"><Reports /></ErrorBoundary>;
                case 'settings': 
                    return <ErrorBoundary key="settings"><Settings /></ErrorBoundary>;
                case 'documents': 
                    return <div key="documents" className="text-center py-12 text-gray-500">Documents module - Coming soon!</div>;
                default: 
                    return <ErrorBoundary key="default"><Dashboard /></ErrorBoundary>;
            }
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
    }, [currentPage, Dashboard, Clients, Projects, Teams, Users, Account, TimeTracking, HR, Manufacturing, Tools, Reports, Settings, ErrorBoundary]);

    // Expose currentPage globally for feedback widgets
    React.useEffect(() => {
        window.currentPage = currentPage;
        return () => {
            delete window.currentPage;
        };
    }, [currentPage]);

    return (
        <div className={`flex h-screen ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
            {/* Mobile Overlay */}
            {mobileMenuOpen && (
                <div 
                    className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden sidebar-overlay"
                    onClick={() => setMobileMenuOpen(false)}
                ></div>
            )}

            {/* Sidebar */}
            <div className={`
                ${sidebarOpen || (mobileMenuOpen && isMobile) ? 'w-64 lg:w-48' : 'w-12'} 
                ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} 
                border-r transition-all duration-300 flex flex-col
                ${mobileMenuOpen ? 'fixed inset-y-0 left-0 z-50 lg:relative lg:z-auto sidebar-mobile open' : 'hidden lg:flex'}
                lg:flex
            `}>
                {/* Logo */}
                <div className={`h-14 lg:h-12 flex items-center justify-between px-3 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                        {(sidebarOpen || (mobileMenuOpen && isMobile)) ? (
                        <div className="flex-1 flex justify-center">
                            <h1 className={`abcotronics-logo abcotronics-logo-text text-xl lg:text-base font-bold ${isDark ? 'text-white' : 'text-primary-600'}`} style={!isDark ? { color: '#0369a1' } : {}}>Abcotronics</h1>
                        </div>
                    ) : (
                        <div className={`abcotronics-logo text-xl lg:text-base font-bold ${isDark ? 'text-white' : 'text-primary-600'}`} style={!isDark ? { color: '#0369a1' } : {}}>A</div>
                    )}
                    <button 
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className={`${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'} p-2 lg:p-1 rounded transition-colors touch-target`}
                    >
                        <i className={`fas fa-${sidebarOpen ? 'chevron-left' : 'chevron-right'} text-base lg:text-sm`}></i>
                    </button>
                </div>

                {/* Menu Items */}
                <nav className="flex-1 overflow-y-auto sidebar-scrollbar py-2">
                    {menuItems.map(item => {
                        // On mobile, show text when sidebar or mobile menu is open
                        const showText = sidebarOpen || (mobileMenuOpen && isMobile);
                        return (
                            <button
                                key={item.id}
                                onClick={() => navigateToPage(item.id)}
                                className={`w-full flex items-center px-3 py-3 lg:px-2 lg:py-1.5 transition-colors text-base lg:text-sm touch-target ${
                                    currentPage === item.id 
                                        ? 'bg-primary-50 text-primary-600 border-r-2 border-primary-600 dark:bg-primary-900 dark:text-primary-200' 
                                        : isDark 
                                            ? 'text-gray-200 hover:bg-gray-700 hover:text-white' 
                                            : 'text-gray-700 hover:bg-gray-50'
                                }`}
                            >
                                <i className={`fas ${item.icon} ${showText ? 'mr-3 lg:mr-2' : ''} w-4 lg:w-3 text-base lg:text-sm`}></i>
                                {showText && <span className="font-medium">{item.label}</span>}
                            </button>
                        );
                    })}
                </nav>

                {/* User Profile */}
                <div className={`border-t ${isDark ? 'border-gray-700' : 'border-gray-200'} p-3 lg:p-2`}>
                    <div className="flex items-center">
                        <div className="w-8 h-8 lg:w-6 lg:h-6 rounded-full bg-primary-600 flex items-center justify-center text-white font-semibold text-sm lg:text-xs">
                            {user?.name?.charAt(0) || 'U'}
                        </div>
                        {(sidebarOpen || (mobileMenuOpen && window.innerWidth < 1024)) && (
                            <div className="ml-3 lg:ml-2 flex-1 min-w-0">
                                <p className={`text-base lg:text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'} truncate`}>{user?.name}</p>
                                <p className={`text-sm lg:text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} truncate`}>{user?.role}</p>
                            </div>
                        )}
                        {(sidebarOpen || (mobileMenuOpen && window.innerWidth < 1024)) && (
                            <button 
                                onClick={logout}
                                className={`${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'} p-2 lg:p-1 rounded transition-colors touch-target`}
                                title="Logout"
                            >
                                <i className="fas fa-sign-out-alt text-sm lg:text-xs"></i>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-auto">
                {/* Header - Fixed on mobile, static on desktop */}
                <header className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b h-14 lg:h-10 flex items-center justify-between px-4 header-mobile sticky lg:static top-0 z-50 lg:z-auto`}>
                    <div className="flex items-center">
                        <button 
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            className={`lg:hidden ${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'} mr-3 p-2 rounded transition-colors touch-target`}
                        >
                            <i className="fas fa-bars text-base"></i>
                        </button>
                        <div className="relative hidden lg:block">
                            <input
                                type="text"
                                placeholder="Search..."
                                className={`w-32 sm:w-48 pl-6 pr-3 py-1 text-xs border rounded focus:ring-1 focus:ring-primary-500 focus:border-transparent ${
                                    isDark 
                                        ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-400' 
                                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                                }`}
                            />
                            <i className={`fas fa-search absolute left-2 top-1.5 text-xs ${isDark ? 'text-gray-400' : 'text-gray-400'}`}></i>
                        </div>
                        <div className="lg:hidden">
                            <h2 className={`abcotronics-logo abcotronics-logo-text text-xl font-semibold ${isDark ? 'text-gray-100' : 'text-primary-600'}`} style={!isDark ? { color: '#0369a1' } : {}}>Abcotronics</h2>
                        </div>
                    </div>
                    <div className="flex items-center space-x-2">
                        {/* Settings Button */}
                        <button 
                            className={`${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'} p-2 lg:p-1.5 rounded-lg transition-all duration-200 touch-target border ${isDark ? 'border-gray-600 hover:border-gray-500' : 'border-gray-200 hover:border-gray-300'}`}
                            title="Settings"
                            onClick={() => {
                                console.log('🔧 Settings button clicked');
                                console.log('🔧 window.SettingsPortal:', typeof window.SettingsPortal);
                                setShowSettingsPortal(true);
                            }}
                        >
                            <i className="fas fa-cog text-sm"></i>
                        </button>
                        
                        {/* Theme Selector Dropdown */}
                        <div className="relative theme-selector">
                            <button 
                                className={`${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'} p-2 lg:p-1.5 rounded-lg transition-all duration-200 touch-target border ${isDark ? 'border-gray-600 hover:border-gray-500' : 'border-gray-200 hover:border-gray-300'}`}
                                title="Theme options"
                                onClick={() => setShowThemeMenu(!showThemeMenu)}
                            >
                                <div className="flex items-center space-x-2">
                                    <i className={`fas fa-${isDark ? 'sun' : 'moon'} text-sm`}></i>
                                    <span className="text-xs font-medium hidden lg:block">
                                        {isDark ? 'Light' : 'Dark'}
                                    </span>
                                </div>
                            </button>
                            
                            {/* Theme Menu */}
                            {showThemeMenu && (
                                <div className={`absolute right-0 top-full mt-2 w-52 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl shadow-xl z-50 backdrop-blur-sm`}>
                                    <div className="p-3">
                                        <div className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-2 px-2`}>
                                            Theme Settings
                                        </div>
                                        <button
                                            onClick={() => {
                                                toggleTheme();
                                                setShowThemeMenu(false);
                                            }}
                                            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${isDark ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-50 text-gray-700'} flex items-center space-x-3`}
                                        >
                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isDark ? 'border-gray-400' : 'border-gray-300'}`}>
                                                <i className={`fas fa-${isDark ? 'sun' : 'moon'} text-xs`}></i>
                                            </div>
                                            <div>
                                                <div>Switch to {isDark ? 'Light' : 'Dark'} Mode</div>
                                                <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                    {isDark ? 'Enable light theme' : 'Enable dark theme'}
                                                </div>
                                            </div>
                                        </button>
                                        <button
                                            onClick={() => {
                                                toggleSystemPreference();
                                                setShowThemeMenu(false);
                                            }}
                                            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 mt-1 ${isDark ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-50 text-gray-700'} flex items-center space-x-3`}
                                        >
                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isFollowingSystem ? 'border-green-500 bg-green-500' : isDark ? 'border-gray-400' : 'border-gray-300'}`}>
                                                <i className={`fas fa-${isFollowingSystem ? 'check' : 'circle'} text-xs ${isFollowingSystem ? 'text-white' : ''}`}></i>
                                            </div>
                                            <div>
                                                <div>{isFollowingSystem ? 'Following System' : 'Follow System'}</div>
                                                <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                    System: {systemPreference === 'dark' ? 'Dark' : 'Light'}
                                                </div>
                                            </div>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <main className="p-4 lg:p-2 sm:p-4 overflow-x-auto">
                    {renderPage}
                </main>
                {/* Global Feedback Widget */}
                {window.FeedbackWidget ? <window.FeedbackWidget /> : null}
                
                {/* Password Change Modal */}
                {PasswordChangeModal && showPasswordChangeModal ? <PasswordChangeModal /> : null}
                
                {/* Settings Portal */}
                {window.SettingsPortal && showSettingsPortal ? (
                    <window.SettingsPortal isOpen={showSettingsPortal} onClose={() => setShowSettingsPortal(false)} />
                ) : showSettingsPortal && !window.SettingsPortal ? console.log('⚠️ SettingsPortal not loaded yet') : null}
            </div>
        </div>
    );
};

// Make available globally
try {
    window.MainLayout = MainLayout;
    console.log('✅ MainLayout.jsx loaded and registered on window.MainLayout', typeof window.MainLayout);
    
    // Verify dependencies
    if (!window.React) console.error('❌ React not available when MainLayout.jsx executed');
    if (!window.debug || !window.debug.performanceMode) {
        if (!window.useAuth) console.warn('⚠️ useAuth not available when MainLayout.jsx executed');
        if (!window.useTheme) console.warn('⚠️ useTheme not available when MainLayout.jsx executed');
    }
} catch (error) {
    console.error('❌ MainLayout.jsx: Error registering component:', error, error.stack);
}
