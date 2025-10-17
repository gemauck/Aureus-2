// Main App Component
const AppContent = () => {
    const { user, loading } = window.useAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading...</p>
                </div>
            </div>
        );
    }

    return user ? <window.MainLayout /> : <window.LoginPage />;
};

// App wrapper with ThemeProvider and AuthProvider
const App = () => {
    return (
        <window.ThemeProvider>
            <window.AuthProvider>
                <AppContent />
            </window.AuthProvider>
        </window.ThemeProvider>
    );
};

// Make App available globally
window.App = App;
