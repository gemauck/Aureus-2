// Main App Component
const AppContent = () => {
    const { user, loading: authLoading } = window.useAuth();
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
window.App = App;
