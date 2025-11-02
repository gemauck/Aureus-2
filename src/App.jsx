// Main App Component
if (window.debug && !window.debug.performanceMode) {
    console.log('🔍 App.jsx: Script is executing...');
}

// Check for invitation page BEFORE any providers are initialized
const checkInvitationRoute = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const pathname = window.location.pathname;
    return pathname === '/accept-invitation' && urlParams.get('token');
};

const AppContent = () => {
    // Check invitation route FIRST, before any auth/data loading
    const urlParams = new URLSearchParams(window.location.search);
    const isInvitationPage = window.location.pathname === '/accept-invitation' && urlParams.get('token');
    const isResetPage = window.location.pathname === '/reset-password' && urlParams.get('token');
    const isPublicJobCardPage = window.location.pathname === '/job-card' || window.location.pathname === '/jobcard';
    
    // State to track if JobCardFormPublic component has loaded
    const [jobCardFormLoaded, setJobCardFormLoaded] = React.useState(!!window.JobCardFormPublic);
    
    // Check for component loading
    React.useEffect(() => {
        if (isPublicJobCardPage && !window.JobCardFormPublic) {
            // Poll for component to load (since it's loaded with defer)
            const checkInterval = setInterval(() => {
                if (window.JobCardFormPublic) {
                    setJobCardFormLoaded(true);
                    clearInterval(checkInterval);
                }
            }, 100);
            
            // Timeout after 5 seconds
            setTimeout(() => {
                clearInterval(checkInterval);
                if (!window.JobCardFormPublic) {
                    console.error('❌ JobCardFormPublic component failed to load after 5 seconds');
                }
            }, 5000);
            
            return () => clearInterval(checkInterval);
        }
    }, [isPublicJobCardPage]);
    
    // Show public job card form - no auth required
    if (isPublicJobCardPage) {
        if (window.JobCardFormPublic && jobCardFormLoaded) {
            return <window.JobCardFormPublic />;
        } else {
            return (
                <div className="min-h-screen flex items-center justify-center bg-gray-50">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                        <p className="text-gray-600">Loading job card form...</p>
                        {!window.JobCardFormPublic && (
                            <p className="text-xs text-gray-500 mt-2">Waiting for component to load...</p>
                        )}
                    </div>
                </div>
            );
        }
    }
    
    // Show invitation page immediately if token is present - bypass all auth checks
    if (isInvitationPage) {
        if (window.AcceptInvitation) {
            return <window.AcceptInvitation />;
        } else {
            // Component not loaded yet - show loading
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

    const { user, loading: authLoading } = window.useAuth();
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
    const { initialLoadComplete, globalLoading } = window.useData();

    // Show loading screen during auth check OR initial data load
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

    return user ? <window.MainLayout /> : <window.LoginPage />;
};

// App wrapper with all providers
const App = () => {
    // Check for invitation route BEFORE wrapping in providers
    const urlParams = new URLSearchParams(window.location.search);
    const isInvitationPage = window.location.pathname === '/accept-invitation' && urlParams.get('token');
    const isResetPage = window.location.pathname === '/reset-password' && urlParams.get('token');
    
    // If public job card page, render it directly without providers (no auth needed)
    const isPublicJobCardPage = window.location.pathname === '/job-card' || window.location.pathname === '/jobcard';
    if (isPublicJobCardPage) {
        // Wait for component to load if not available yet
        if (window.JobCardFormPublic) {
            return (
                <window.ThemeProvider>
                    <window.JobCardFormPublic />
                </window.ThemeProvider>
            );
        }
        // Show loading state while component loads
        return (
            <window.ThemeProvider>
                <div className="min-h-screen flex items-center justify-center bg-gray-50">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                        <p className="text-gray-600">Loading job card form...</p>
                        <p className="text-xs text-gray-500 mt-2">If this doesn't load, check browser console</p>
                    </div>
                </div>
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
        console.log('✅ App.jsx loaded and registered on window.App', typeof window.App);
    }
    
    // Verify React is available
    if (!window.React) {
        console.error('❌ React not available when App.jsx executed');
    }
} catch (error) {
    console.error('❌ App.jsx: Error registering component:', error);
}
