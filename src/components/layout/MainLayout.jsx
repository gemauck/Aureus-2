// Use React from window
if (window.debug && !window.debug.performanceMode) {
    console.log('🔍 MainLayout-mobile-fixed.jsx: Script is executing...');
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
    // BUT: Don't redirect public routes (job-card, accept-invitation, reset-password)
    React.useEffect(() => {
        const pathname = (window.location.pathname || '').toLowerCase();
        const publicRoutes = ['/job-card', '/jobcard', '/accept-invitation', '/reset-password'];
        const isPublicRoute = publicRoutes.some(route => {
            const lowerRoute = route.toLowerCase();
            return pathname === lowerRoute || pathname.startsWith(lowerRoute + '/');
        });
        
        if (pathname !== '/' && !isPublicRoute) {
            window.history.replaceState({ page: 'dashboard' }, '', '/');
        }
    }, []);
    
    const [sidebarOpen, setSidebarOpen] = useState(false); // Start closed on mobile
    const [isMobile, setIsMobile] = useState(false);
    const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
    
    // Initialize mobile state on mount only and set initial sidebar state
    React.useEffect(() => {
        const width = window.innerWidth;
        const mobile = width < 1024;
        setIsMobile(mobile);
        setWindowWidth(width);
        
        // Set initial sidebar state based on screen size
        if (mobile) {
            setSidebarOpen(false); // Always start closed on mobile
        } else {
            // Desktop: respect user preference
            const manuallyCollapsed = localStorage.getItem('sidebarManuallyCollapsed') === 'true';
            setSidebarOpen(!manuallyCollapsed);
        }
    }, []); // Only run once on mount
    
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
    const { user, logout } = window.useAuth();
    const { theme, toggleTheme, toggleSystemPreference, isFollowingSystem, systemPreference, isDark } = window.useTheme();
    
    // Debug user object immediately
    React.useEffect(() => {
        console.error('🚨 DEBUG: MainLayout user object:', {
            user,
            userType: typeof user,
            hasUser: !!user,
            userId: user?.id,
            userEmail: user?.email,
            userName: user?.name,
            userRole: user?.role,
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

    // Close mobile menu when page changes
    React.useEffect(() => {
        if (isMobile) {
            setSidebarOpen(false);
        }
    }, [currentPage, isMobile]);

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

    // Get components from window
    const Dashboard = React.useMemo(() => {
        return window.DashboardSimple || window.DashboardFallback || window.DashboardDatabaseFirst || window.DashboardLive || window.Dashboard || (() => <div className="text-center py-12 text-gray-500">Dashboard loading...</div>);
    }, []);
    
    const ErrorBoundary = React.useMemo(() => {
        return window.ErrorBoundary || (({ children }) => children);
    }, []);
    
    const [clientsComponentReady, setClientsComponentReady] = React.useState(false);
    
    React.useEffect(() => {
        const checkClients = () => {
            const ClientsComponent = window.Clients || window.ClientsSimple;
            const isValidComponent = ClientsComponent && (
                typeof ClientsComponent === 'function' || 
                (typeof ClientsComponent === 'object' && ClientsComponent.$$typeof)
            );
            if (isValidComponent && !clientsComponentReady) {
                console.log('✅ MainLayout: Clients component became available');
                setClientsComponentReady(true);
                return true;
            }
            return false;
        };
        
        if (checkClients()) return;
        
        const handleClientsAvailable = () => {
            if (checkClients()) {
                window.removeEventListener('clientsComponentReady', handleClientsAvailable);
            }
        };
        window.addEventListener('clientsComponentReady', handleClientsAvailable);
        
        if (window._clientsComponentReady) {
            checkClients();
        }
        
        const interval = setInterval(() => {
            if (!clientsComponentReady) {
                checkClients();
            } else {
                clearInterval(interval);
            }
        }, 200);
        
        const timeout = setTimeout(() => {
            clearInterval(interval);
            window.removeEventListener('clientsComponentReady', handleClientsAvailable);
        }, 20000);
        
        return () => {
            clearInterval(interval);
            clearTimeout(timeout);
            window.removeEventListener('clientsComponentReady', handleClientsAvailable);
        };
    }, [clientsComponentReady]);
    
    const [notificationCenterReady, setNotificationCenterReady] = React.useState(false);
    
    React.useEffect(() => {
        const checkNotificationCenter = () => {
            const NotificationCenterComponent = window.NotificationCenter;
            const isValidComponent = NotificationCenterComponent && typeof NotificationCenterComponent === 'function';
            if (isValidComponent && !notificationCenterReady) {
                console.log('✅ MainLayout: NotificationCenter component became available');
                setNotificationCenterReady(true);
                return true;
            }
            return false;
        };
        
        if (checkNotificationCenter()) return;
        
        const interval = setInterval(() => {
            if (!notificationCenterReady) {
                checkNotificationCenter();
            } else {
                clearInterval(interval);
            }
        }, 200);
        
        const timeout = setTimeout(() => {
            clearInterval(interval);
        }, 10000);
        
        return () => {
            clearInterval(interval);
            clearTimeout(timeout);
        };
    }, [notificationCenterReady]);
    
    const Clients = React.useMemo(() => {
        if (isMobile && window.ClientsMobileOptimized) {
            return window.ClientsMobileOptimized;
        }
        if (isMobile && window.ClientsMobile) {
            return window.ClientsMobile;
        }
        return window.Clients || window.ClientsSimple || (() => <div className="text-center py-12 text-gray-500">Clients loading...</div>);
    }, [clientsComponentReady, isMobile]);
    
    const Pipeline = React.useMemo(() => {
        return window.Pipeline;
    }, []);
    
    const [projectsComponentReady, setProjectsComponentReady] = React.useState(false);
    
    React.useEffect(() => {
        const checkProjects = () => {
            const ProjectsComponent = window.Projects || window.ProjectsDatabaseFirst || window.ProjectsSimple;
            if (ProjectsComponent && !projectsComponentReady) {
                console.log('✅ MainLayout: Projects component became available');
                setProjectsComponentReady(true);
            }
        };
        
        checkProjects();
        
        const interval = setInterval(checkProjects, 500);
        const timeout = setTimeout(() => clearInterval(interval), 10000);
        
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
    }, [projectsComponentReady]);
    
    const Teams = window.Teams || window.TeamsSimple || (() => <div className="text-center py-12 text-gray-500">Teams module loading...</div>);
    const Users = window.UserManagement || window.Users || (() => {
        console.warn('⚠️ MainLayout: Users component not found.');
        return <div className="text-center py-12 text-gray-500">Users component loading...</div>;
    });
    
    const PasswordChangeModal = window.PasswordChangeModal;
    const TimeTracking = window.TimeTracking || window.TimeTrackingDatabaseFirst || (() => <div className="text-center py-12 text-gray-500">Time Tracking loading...</div>);
    const HR = window.HR || (() => <div className="text-center py-12 text-gray-500">HR loading...</div>);
    const Manufacturing = window.Manufacturing || (() => {
        console.warn('⚠️ Manufacturing component not loaded yet.');
        return <div className="text-center py-12 text-gray-500">Manufacturing loading...</div>;
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

    const [refreshingRole, setRefreshingRole] = React.useState(false);
    
    const menuItems = React.useMemo(() => {
        const userRole = user?.role?.toLowerCase();
        const hasUser = !!user && user !== null && user !== undefined;
        
        if (hasUser && !user.role && window.useAuth && !refreshingRole) {
            const { refreshUser } = window.useAuth();
            if (refreshUser) {
                console.log('🔄 User missing role, refreshing from API...');
                setRefreshingRole(true);
                refreshUser().then((refreshedUser) => {
                    if (refreshedUser?.role) {
                        console.log('✅ Role refreshed:', refreshedUser.role);
                    }
                    setTimeout(() => setRefreshingRole(false), 3000);
                }).catch(() => {
                    setTimeout(() => setRefreshingRole(false), 3000);
                });
            }
        }
        
        if (userRole === 'guest') {
            return allMenuItems.filter(item => item.id === 'projects');
        }
        
        const filtered = allMenuItems.filter(item => {
            if (item.adminOnly) {
                return userRole === 'admin';
            }
            return true;
        });
        
        return filtered;
    }, [user?.role, user?.id, user?.email, refreshingRole]);

    const isAdmin = React.useMemo(() => {
        const userRole = user?.role?.toLowerCase();
        return userRole === 'admin';
    }, [user?.role]);

    React.useEffect(() => {
        const userRole = user?.role?.toLowerCase();
        
        if ((currentPage === 'users' || currentPage === 'hr') && !isAdmin) {
            console.warn(`Access denied: ${currentPage} page requires admin role`);
            navigateToPage('dashboard');
        }
        
        if (userRole === 'guest' && currentPage !== 'projects') {
            console.warn(`Access denied: Guest users can only access Projects`);
            navigateToPage('projects');
        }
    }, [currentPage, isAdmin, user?.role]);

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
                    if (!isAdmin) {
                        return (
                            <div key="users-access-denied" className="flex items-center justify-center min-h-[400px]">
                                <div className="text-center">
                                    <i className="fas fa-lock text-4xl text-gray-400 mb-4"></i>
                                    <h2 className={`text-xl font-semibold mb-2 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Access Denied</h2>
                                    <p className={isDark ? 'text-gray-400' : 'text-gray-600'}>You need administrator privileges to access this page.</p>
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
                    if (!isAdmin) {
                        return (
                            <div key="hr-access-denied" className="flex items-center justify-center min-h-[400px]">
                                <div className="text-center">
                                    <i className="fas fa-lock text-4xl text-gray-400 mb-4"></i>
                                    <h2 className={`text-xl font-semibold mb-2 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Access Denied</h2>
                                    <p className={isDark ? 'text-gray-400' : 'text-gray-600'}>You need administrator privileges to access the HR page.</p>
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
    }, [currentPage, Dashboard, Clients, Projects, Teams, Users, Account, TimeTracking, HR, Manufacturing, Tools, Reports, Settings, ErrorBoundary, isAdmin]);

    React.useEffect(() => {
        window.currentPage = currentPage;
        return () => {
            delete window.currentPage;
        };
    }, [currentPage]);

    return (
        <div className={`flex h-screen overflow-hidden ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
            {/* Mobile Sidebar Overlay - FIXED positioning */}
            {isMobile && sidebarOpen && (
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
                    ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} 
                    border-r transition-all duration-300 flex flex-col
                    ${isMobile ? 'fixed z-50' : 'relative z-10'}
                `}
                style={{
                    // Mobile: Fixed positioning, slide in from left
                    ...(isMobile ? {
                        position: 'fixed',
                        top: 0,
                        left: sidebarOpen ? 0 : '-280px',
                        height: '100vh',
                        width: '280px',
                        zIndex: 50,
                    } : {
                        // Desktop: Normal flow, variable width
                        position: 'relative',
                        width: sidebarOpen ? '240px' : '64px',
                        minWidth: sidebarOpen ? '240px' : '64px',
                        flexShrink: 0,
                    })
                }}
            >
                {/* Logo */}
                <div className={`h-14 flex items-center ${sidebarOpen ? 'justify-between px-4' : 'justify-center px-2'} border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                    {sidebarOpen && (
                        <h1 className={`font-bold ${isDark ? 'text-white' : 'text-primary-600'} text-lg`}>
                            Abcotronics
                        </h1>
                    )}
                    <button 
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className={`${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'} p-2 rounded transition-colors`}
                        aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
                    >
                        <i className={`fas fa-${sidebarOpen ? 'times' : 'bars'} text-lg`}></i>
                    </button>
                </div>

                {/* Menu Items */}
                <nav className="flex-1 overflow-y-auto py-2">
                    {menuItems.map(item => (
                        <button
                            key={item.id}
                            onClick={() => {
                                navigateToPage(item.id);
                                if (isMobile) {
                                    setSidebarOpen(false);
                                }
                            }}
                            className={`w-full flex items-center ${sidebarOpen ? 'px-4 py-3 space-x-3' : 'px-2 py-3 justify-center'} transition-colors ${
                                currentPage === item.id 
                                    ? isDark
                                        ? 'bg-primary-900 text-primary-200 border-r-2 border-primary-400'
                                        : 'bg-primary-50 text-primary-600 border-r-2 border-primary-600'
                                    : isDark 
                                        ? 'text-gray-200 hover:bg-gray-700' 
                                        : 'text-gray-700 hover:bg-gray-50'
                            }`}
                            title={!sidebarOpen ? item.label : ''}
                        >
                            <i className={`fas ${item.icon} text-lg`}></i>
                            {sidebarOpen && <span className="font-medium">{item.label}</span>}
                        </button>
                    ))}
                </nav>

                {/* User Profile */}
                <div className={`border-t ${isDark ? 'border-gray-700' : 'border-gray-200'} p-3`}>
                    <div className={`flex items-center ${sidebarOpen ? 'space-x-3' : 'justify-center'}`}>
                        <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-white font-semibold">
                            {user?.name?.charAt(0) || 'U'}
                        </div>
                        {sidebarOpen && (
                            <>
                                <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'} truncate`}>{user?.name}</p>
                                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} truncate`}>{user?.role}</p>
                                </div>
                                <button 
                                    onClick={logout}
                                    className={`${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'} p-2 rounded transition-colors`}
                                    title="Logout"
                                >
                                    <i className="fas fa-sign-out-alt"></i>
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
            
            {/* Main Content - ALWAYS FULL WIDTH */}
            <div className="flex-1 flex flex-col overflow-hidden" style={{ minWidth: 0, width: '100%' }}>
                {/* Header - STICKY on mobile */}
                <header 
                    className={`
                        ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} 
                        border-b h-14 flex items-center justify-between px-4 flex-shrink-0
                        ${isMobile ? 'sticky top-0 z-30' : ''}
                    `}
                >
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                        {/* Hamburger - MOBILE ONLY */}
                        {isMobile && (
                            <button 
                                onClick={() => setSidebarOpen(true)}
                                className={`${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'} p-2 rounded transition-colors`}
                                aria-label="Open menu"
                            >
                                <i className="fas fa-bars text-xl"></i>
                            </button>
                        )}
                        
                        {/* Logo - MOBILE ONLY */}
                        {isMobile && (
                            <h1 className={`font-bold ${isDark ? 'text-white' : 'text-primary-600'} text-base truncate`}>
                                Abcotronics
                            </h1>
                        )}
                        
                        {/* Search - DESKTOP ONLY */}
                        {!isMobile && window.GlobalSearch && (
                            <window.GlobalSearch isMobile={false} isDark={isDark} />
                        )}
                    </div>
                    
                    <div className="flex items-center space-x-2">
                        {/* Notification Center */}
                        {notificationCenterReady && window.NotificationCenter && (
                            <window.NotificationCenter />
                        )}
                        
                        {/* Settings Button */}
                        <button
                            onClick={() => navigateToPage('settings')}
                            className={`${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'} p-2 rounded-lg transition-colors border ${isDark ? 'border-gray-600' : 'border-gray-200'}`}
                            title="Settings"
                        >
                            <i className="fas fa-cog"></i>
                        </button>
                        
                        {/* Theme Selector */}
                        <div className="relative theme-selector">
                            <button 
                                className={`${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'} p-2 rounded-lg transition-colors border ${isDark ? 'border-gray-600' : 'border-gray-200'}`}
                                onClick={() => setShowThemeMenu(!showThemeMenu)}
                            >
                                <i className={`fas fa-${isDark ? 'sun' : 'moon'}`}></i>
                            </button>
                            
                            {showThemeMenu && (
                                <div className={`absolute right-0 top-full mt-2 w-52 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl shadow-xl z-50`}>
                                    <div className="p-3">
                                        <div className={`text-xs font-semibold uppercase ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-2 px-2`}>
                                            Theme
                                        </div>
                                        <button
                                            onClick={() => {
                                                toggleTheme();
                                                setShowThemeMenu(false);
                                            }}
                                            className={`w-full text-left px-3 py-2 rounded-lg text-sm ${isDark ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-50 text-gray-700'} flex items-center space-x-3`}
                                        >
                                            <i className={`fas fa-${isDark ? 'sun' : 'moon'}`}></i>
                                            <span>Switch to {isDark ? 'Light' : 'Dark'}</span>
                                        </button>
                                        <button
                                            onClick={() => {
                                                toggleSystemPreference();
                                                setShowThemeMenu(false);
                                            }}
                                            className={`w-full text-left px-3 py-2 rounded-lg text-sm mt-1 ${isDark ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-50 text-gray-700'} flex items-center space-x-3`}
                                        >
                                            <i className={`fas fa-${isFollowingSystem ? 'check' : 'circle'}`}></i>
                                            <span>{isFollowingSystem ? 'Following' : 'Follow'} System</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                {/* Page Content - SCROLLABLE */}
                <main className="flex-1 overflow-y-auto overflow-x-hidden p-4" style={{ width: '100%', maxWidth: '100%' }}>
                    <div className="w-full max-w-full">
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
    console.log('✅ MainLayout-mobile-fixed.jsx loaded and registered');
} catch (error) {
    console.error('❌ MainLayout-mobile-fixed.jsx: Error:', error);
}
