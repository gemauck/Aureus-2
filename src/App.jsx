// Main App Component
if (window.debug && !window.debug.performanceMode) {
}

// Check for invitation page BEFORE any providers are initialized
const checkInvitationRoute = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const pathname = window.location.pathname;
    return pathname === '/accept-invitation' && urlParams.get('token');
};

const AppContent = () => {
    // CRITICAL: ALL hooks must be called at the top, in the same order, before ANY conditional returns
    // This is required by React's rules of hooks - hooks cannot be called conditionally
    
    // Get route info first (not a hook, just variable)
    const pathname = (window.location.pathname || '').toLowerCase();
    const urlParams = new URLSearchParams(window.location.search);
    const isInvitationPage = pathname === '/accept-invitation' && urlParams.get('token');
    const isResetPage = pathname === '/reset-password' && urlParams.get('token');
    const isPublicJobCardPage = pathname === '/job-card' || pathname === '/jobcard';
    
    // Call ALL useState hooks first (must be in same order every render)
    const [jobCardFormLoaded, setJobCardFormLoaded] = window.React.useState(!!window.JobCardFormPublic);
    const [loginPageReady, setLoginPageReady] = window.React.useState(!!window.LoginPage);
    
    // Get auth state - always call this hook
    let user = null;
    let authLoading = true;
    try {
        const authState = window.useAuth();
        user = authState?.user || null;
        authLoading = authState?.loading !== undefined ? authState.loading : false;
    } catch (authError) {
        console.error('❌ AppContent: Error calling useAuth:', authError);
        user = null;
        authLoading = false;
    }
    
    // Get data state - always call this hook
    let initialLoadComplete = true;
    let globalLoading = false;
    try {
        const dataState = window.useData();
        initialLoadComplete = dataState?.initialLoadComplete !== undefined ? dataState.initialLoadComplete : true;
        globalLoading = dataState?.globalLoading !== undefined ? dataState.globalLoading : false;
    } catch (dataError) {
        console.error('❌ AppContent: Error calling useData:', dataError);
        initialLoadComplete = true;
        globalLoading = false;
    }
    
    // Call ALL useEffect hooks (must be in same order every render)
    // Toggle a body class so mobile CSS can avoid affecting the login page
    window.React.useEffect(() => {
        const body = document.body;
        if (!user) {
            body.classList.add('login-page');
        } else {
            body.classList.remove('login-page');
        }
        return () => {
            body.classList.remove('login-page');
        };
    }, [user]);
    
    // Job card form loading effect
    window.React.useEffect(() => {
        if (isPublicJobCardPage && !window.JobCardFormPublic) {
            const checkInterval = setInterval(() => {
                if (window.JobCardFormPublic) {
                    setJobCardFormLoaded(true);
                    clearInterval(checkInterval);
                }
            }, 100);
            setTimeout(() => clearInterval(checkInterval), 5000);
            return () => clearInterval(checkInterval);
        }
    }, [isPublicJobCardPage, setJobCardFormLoaded]);
    
    // LoginPage loading effect
    window.React.useEffect(() => {
        if (loginPageReady || user) return; // Already ready or user is logged in
        
        // Wait for LoginPage to load
        const checkLoginPage = () => {
            if (window.LoginPage) {
                setLoginPageReady(true);
                return true;
            }
            return false;
        };
        
        // Check immediately
        if (checkLoginPage()) return;
        
        // Listen for component loaded event
        const handleComponentLoaded = (e) => {
            if (e.detail?.component === 'LoginPage' || window.LoginPage) {
                setLoginPageReady(true);
            }
        };
        
        window.addEventListener('componentLoaded', handleComponentLoaded);
        
        // Poll as fallback
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds
        const interval = setInterval(() => {
            attempts++;
            if (checkLoginPage() || attempts >= maxAttempts) {
                clearInterval(interval);
                window.removeEventListener('componentLoaded', handleComponentLoaded);
            }
        }, 100);
        
        return () => {
            clearInterval(interval);
            window.removeEventListener('componentLoaded', handleComponentLoaded);
        };
    }, [loginPageReady, user]);
    
    // NOW handle conditional rendering AFTER all hooks are called
    // Handle public routes
    if (isInvitationPage) {
        if (window.AcceptInvitation) {
            return <window.AcceptInvitation />;
        } else {
            return (
                <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-blue-700">
                    <div className="text-white text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                        <p>Loading invitation...</p>
                    </div>
                </div>
            );
        }
    }
    
    if (isResetPage) {
        if (window.ResetPassword) {
            return <window.ResetPassword />;
        } else {
            return (
                <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-blue-700">
                    <div className="text-white text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                        <p>Loading reset page...</p>
                    </div>
                </div>
            );
        }
    }
    
    if (isPublicJobCardPage) {
        if (window.JobCardFormPublic && jobCardFormLoaded) {
            return <window.JobCardFormPublic />;
        } else {
            return (
                <div className="min-h-screen flex items-center justify-center bg-gray-50">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                        <p className="text-gray-600">Loading job card form...</p>
                    </div>
                </div>
            );
        }
    }

    // Show loading screen during auth check OR initial data load (only if user exists)
    // DataContext handles no-user case by setting initialLoadComplete=true immediately
    if (authLoading || (user && !initialLoadComplete)) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="text-center">
                    <div className="relative">
                        {/* Animated logo/icon */}
                        <div className="w-20 h-20 mx-auto mb-6 relative">
                            <div className="absolute inset-0 bg-gradient-to-tr from-blue-500 to-blue-600 rounded-2xl animate-pulse"></div>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <i className="fas fa-database text-white text-3xl"></i>
                            </div>
                        </div>
                        
                        {/* Loading spinner */}
                        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
                    </div>
                    
                    {/* Loading text */}
                    <div className="space-y-2">
                        <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                            {authLoading ? 'Authenticating...' : 'Loading your workspace...'}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            {authLoading ? 'Verifying credentials' : 'Preparing clients, projects, and data'}
                        </p>
                    </div>

                    {/* Progress indicator */}
                    {!authLoading && user && (
                        <div className="mt-6 max-w-xs mx-auto">
                            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 animate-[loading_1.5s_ease-in-out_infinite]"></div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Show loading screen during auth check OR initial data load (only if user exists)
    // DataContext handles no-user case by setting initialLoadComplete=true immediately
    if (authLoading || (user && !initialLoadComplete)) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="text-center">
                    <div className="relative">
                        {/* Animated logo/icon */}
                        <div className="w-20 h-20 mx-auto mb-6 relative">
                            <div className="absolute inset-0 bg-gradient-to-tr from-blue-500 to-blue-600 rounded-2xl animate-pulse"></div>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <i className="fas fa-database text-white text-3xl"></i>
                            </div>
                        </div>
                        
                        {/* Loading spinner */}
                        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
                    </div>
                    
                    {/* Loading text */}
                    <div className="space-y-2">
                        <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                            {authLoading ? 'Authenticating...' : 'Loading your workspace...'}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            {authLoading ? 'Verifying credentials' : 'Preparing clients, projects, and data'}
                        </p>
                    </div>

                    {/* Progress indicator */}
                    {!authLoading && user && (
                        <div className="mt-6 max-w-xs mx-auto">
                            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 animate-[loading_1.5s_ease-in-out_infinite]"></div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }
    
    // Handle rendering based on user state
    if (!user) {
        if (window.LoginPage && loginPageReady) {
            return <window.LoginPage />;
        } else {
            // LoginPage not loaded yet - show loading
            return (
                <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
                        <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">Loading login...</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Please wait</p>
                    </div>
                </div>
            );
        }
    }
    
    return <window.MainLayout />;
};

// App wrapper with all providers
const App = () => {
    // Check for invitation route BEFORE wrapping in providers
    // Use lowercase comparison for mobile browser compatibility
    const pathname = (window.location.pathname || '').toLowerCase();
    const urlParams = new URLSearchParams(window.location.search);
    const isInvitationPage = pathname === '/accept-invitation' && urlParams.get('token');
    const isResetPage = pathname === '/reset-password' && urlParams.get('token');
    
    // If public job card page, render it directly without providers (no auth needed)
    const isPublicJobCardPage = pathname === '/job-card' || pathname === '/jobcard';

    // Track readiness of the public job card component so we can
    // re-render when it becomes available on window.JobCardFormPublic.
    const [publicJobCardReady, setPublicJobCardReady] = window.React.useState(
        !!(window.JobCardFormPublic && typeof window.JobCardFormPublic === 'function')
    );

    window.React.useEffect(() => {
        if (!isPublicJobCardPage || publicJobCardReady) {
            return;
        }

        const checkReady = () => {
            if (window.JobCardFormPublic && typeof window.JobCardFormPublic === 'function') {
                setPublicJobCardReady(true);
                return true;
            }
            return false;
        };

        // Initial synchronous check
        if (checkReady()) {
            return;
        }

        // Listen for explicit ready event from component
        const handleReadyEvent = () => {
            if (checkReady()) {
                window.removeEventListener('jobCardFormPublicReady', handleReadyEvent);
            }
        };
        window.addEventListener('jobCardFormPublicReady', handleReadyEvent);

        // Poll as a fallback in case event is missed
        let attempts = 0;
        const maxAttempts = 100; // 10 seconds
        const interval = setInterval(() => {
            attempts += 1;
            if (checkReady() || attempts >= maxAttempts) {
                clearInterval(interval);
                window.removeEventListener('jobCardFormPublicReady', handleReadyEvent);
            }
        }, 100);

        return () => {
            clearInterval(interval);
            window.removeEventListener('jobCardFormPublicReady', handleReadyEvent);
        };
    }, [isPublicJobCardPage, publicJobCardReady]);

    if (isPublicJobCardPage) {
        return (
            <window.ThemeProvider>
                {window.JobCardFormPublic && publicJobCardReady ? (
                    <window.JobCardFormPublic />
                ) : (
                    <div className="min-h-screen flex items-center justify-center bg-gray-50">
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                            <p className="text-gray-600">Loading job card form...</p>
                            <p className="text-xs text-gray-500 mt-2">If this doesn't load, check browser console</p>
                        </div>
                    </div>
                )}
            </window.ThemeProvider>
        );
    }
    
    // If invitation page, render it directly without providers (no auth needed)
    if (isInvitationPage) {
        if (window.AcceptInvitation) {
            return <window.AcceptInvitation />;
        }
        // If component not loaded, use ThemeProvider only (for dark mode support)
        return (
            <window.ThemeProvider>
                <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-blue-700">
                    <div className="text-white text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                        <p>Loading invitation page...</p>
                    </div>
                </div>
            </window.ThemeProvider>
        );
    }
    if (isResetPage) {
        if (window.ResetPassword) {
            return <window.ResetPassword />;
        }
        return (
            <window.ThemeProvider>
                <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-blue-700">
                    <div className="text-white text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                        <p>Loading reset page...</p>
                    </div>
                </div>
            </window.ThemeProvider>
        );
    }
    
    // Normal app with all providers
    return (
        <window.ThemeProvider>
            <window.AuthProvider>
                <window.DataProvider>
                    <AppContent />
                </window.DataProvider>
            </window.AuthProvider>
        </window.ThemeProvider>
    );
};

// Add loading animation keyframes to document
if (!document.getElementById('loading-animations')) {
    const style = document.createElement('style');
    style.id = 'loading-animations';
    style.textContent = `
        @keyframes loading {
            0% { transform: translateX(-100%); }
            50% { transform: translateX(100%); }
            100% { transform: translateX(-100%); }
        }
    `;
    document.head.appendChild(style);
}

// Make App available globally
try {
    window.App = App;
    if (window.debug && !window.debug.performanceMode) {
    }
    
    // Verify React is available
    if (!window.React) {
        console.error('❌ React not available when App.jsx executed');
    }
} catch (error) {
    console.error('❌ App.jsx: Error registering component:', error);
}
