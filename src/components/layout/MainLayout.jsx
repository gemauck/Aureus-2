// Use React from window
const { useState } = React;

const MainLayout = () => {
    // Initialize currentPage from URL on first load
    const getPageFromURL = () => {
        const path = window.location.pathname;
        if (path.startsWith('/') && path.length > 1) {
            return path.substring(1); // Remove leading '/'
        }
        return 'dashboard';
    };

    const [currentPage, setCurrentPage] = useState(getPageFromURL());
    const [sidebarOpen, setSidebarOpen] = useState(false); // Start closed on mobile
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [showThemeMenu, setShowThemeMenu] = useState(false);
    const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
    const { user, logout } = window.useAuth();
    const { theme, toggleTheme, toggleSystemPreference, isFollowingSystem, systemPreference, isDark } = window.useTheme();

    // Update URL when page changes
    const navigateToPage = (page) => {
        console.log('🔄 MainLayout: Navigating to page:', page);
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

    // Get components from window - prioritize live dashboard over others with fallback
    const Dashboard = window.DashboardLive || window.DashboardDatabaseFirst || window.DashboardSimple || window.DashboardFallback || window.Dashboard || (() => <div className="text-center py-12 text-gray-500">Dashboard loading...</div>);
    const ErrorBoundary = window.ErrorBoundary || (({ children }) => children);
    const Clients = window.Clients || window.ClientsSimple || (() => <div className="text-center py-12 text-gray-500">Clients loading...</div>);
    const Pipeline = window.Pipeline;
    const Projects = window.Projects || window.ProjectsDatabaseFirst || window.ProjectsSimple || (() => <div className="text-center py-12 text-gray-500">Projects loading...</div>);
    const Teams = window.TeamsEnhanced || window.Teams || (() => <div className="text-center py-12 text-gray-500">Teams module - Coming soon!</div>);
    const Users = window.UserManagement || (() => <div className="text-center py-12 text-gray-500">Users loading...</div>);
    const PasswordChangeModal = window.PasswordChangeModal;
    const TimeTracking = window.TimeTracking || window.TimeTrackingDatabaseFirst || (() => <div className="text-center py-12 text-gray-500">Time Tracking loading...</div>);
    const HR = window.HR || (() => <div className="text-center py-12 text-gray-500">HR loading...</div>);
    const Manufacturing = window.Manufacturing || (() => <div className="text-center py-12 text-gray-500">Manufacturing loading...</div>);
    const Tools = window.Tools || (() => <div className="text-center py-12 text-gray-500">Tools loading...</div>);
    const Reports = window.Reports || (() => <div className="text-center py-12 text-gray-500">Reports loading...</div>);
    const Settings = window.Settings || (() => <div className="text-center py-12 text-gray-500">Settings loading...</div>);
    const Account = window.Account || (() => <div className="text-center py-12 text-gray-500">Account loading...</div>);

    const menuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: 'fa-th-large' },
        { id: 'clients', label: 'Clients', icon: 'fa-users' },
        { id: 'projects', label: 'Projects', icon: 'fa-project-diagram' },
        { id: 'teams', label: 'Teams', icon: 'fa-user-friends' },
        { id: 'users', label: 'Users', icon: 'fa-user-cog' },
        { id: 'account', label: 'Account', icon: 'fa-user-circle' },
        { id: 'hr', label: 'HR', icon: 'fa-id-card' },
        { id: 'manufacturing', label: 'Manufacturing', icon: 'fa-industry' },
        { id: 'tools', label: 'Tools', icon: 'fa-toolbox' },
        { id: 'documents', label: 'Documents', icon: 'fa-folder-open' },
        { id: 'reports', label: 'Reports', icon: 'fa-chart-bar' },
    ];

    const renderPage = () => {
        console.log('🔄 MainLayout: Showing page:', currentPage);
        
        // Keep all components mounted but show/hide them - prevents remount and data reload
        const isVisible = (pageId) => currentPage === pageId ? 'block' : 'none';
        
        return (
            <>
                {/* Keep all components mounted - just hide/show */}
                <div style={{ display: isVisible('dashboard') }}>
                    <ErrorBoundary><Dashboard /></ErrorBoundary>
                </div>
                <div style={{ display: isVisible('clients') }}>
                    <ErrorBoundary><Clients /></ErrorBoundary>
                </div>
                <div style={{ display: isVisible('projects') }}>
                    <ErrorBoundary><Projects /></ErrorBoundary>
                </div>
                <div style={{ display: isVisible('teams') }}>
                    <ErrorBoundary><Teams /></ErrorBoundary>
                </div>
                <div style={{ display: isVisible('users') }}>
                    <ErrorBoundary><Users /></ErrorBoundary>
                </div>
                <div style={{ display: isVisible('account') }}>
                    <ErrorBoundary><Account /></ErrorBoundary>
                </div>
                <div style={{ display: isVisible('time') }}>
                    <ErrorBoundary><TimeTracking /></ErrorBoundary>
                </div>
                <div style={{ display: isVisible('hr') }}>
                    <ErrorBoundary><HR /></ErrorBoundary>
                </div>
                <div style={{ display: isVisible('manufacturing') }}>
                    <ErrorBoundary><Manufacturing /></ErrorBoundary>
                </div>
                <div style={{ display: isVisible('tools') }}>
                    <ErrorBoundary><Tools /></ErrorBoundary>
                </div>
                <div style={{ display: isVisible('reports') }}>
                    <ErrorBoundary><Reports /></ErrorBoundary>
                </div>
                <div style={{ abhey: isVisible('settings') }}>
                    <ErrorBoundary><Settings /></ErrorBoundary>
                </div>
                <div style={{ display: isVisible('documents') }}>
                    <div className="text-center py-12 text-gray-500">Documents module - Coming soon!</div>
                </div>
            </>
        );
    };

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
                ${sidebarOpen ? 'w-64 lg:w-48' : 'w-12'} 
                ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} 
                border-r transition-all duration-300 flex flex-col
                ${mobileMenuOpen ? 'fixed inset-y-0 left-0 z-50 lg:relative lg:z-auto sidebar-mobile open' : 'hidden lg:flex'}
                lg:flex
            `}>
                {/* Logo */}
                <div className={`h-14 lg:h-12 flex items-center justify-between px-3 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                    {sidebarOpen ? (
                        <div className="flex-1">
                            <h1 className={`text-lg lg:text-sm font-bold ${isDark ? 'text-white' : 'text-primary-600'}`}>Abcotronics</h1>
                        </div>
                    ) : (
                        <div className={`text-lg lg:text-sm font-bold ${isDark ? 'text-white' : 'text-primary-600'}`}>A</div>
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
                    {menuItems.map(item => (
                        <button
                            key={item.id}
                            onClick={() => {
                                console.log('🔄 MainLayout: Navigation clicked:', item.id);
                                navigateToPage(item.id);
                            }}
                            className={`w-full flex items-center px-3 py-3 lg:px-2 lg:py-1.5 transition-colors text-sm lg:text-xs touch-target ${
                                currentPage === item.id 
                                    ? 'bg-primary-50 text-primary-600 border-r-2 border-primary-600' 
                                    : isDark 
                                        ? 'text-gray-200 hover:bg-gray-700 hover:text-white' 
                                        : 'text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            <i className={`fas ${item.icon} ${sidebarOpen ? 'mr-3 lg:mr-2' : ''} w-4 lg:w-3 text-sm lg:text-xs`}></i>
                            {sidebarOpen && <span className="font-medium">{item.label}</span>}
                        </button>
                    ))}
                </nav>

                {/* User Profile */}
                <div className={`border-t ${isDark ? 'border-gray-700' : 'border-gray-200'} p-3 lg:p-2`}>
                    <div className="flex items-center">
                        <div className="w-8 h-8 lg:w-6 lg:h-6 rounded-full bg-primary-600 flex items-center justify-center text-white font-semibold text-sm lg:text-xs">
                            {user?.name?.charAt(0) || 'U'}
                        </div>
                        {sidebarOpen && (
                            <div className="ml-3 lg:ml-2 flex-1 min-w-0">
                                <p className={`text-sm lg:text-xs font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'} truncate`}>{user?.name}</p>
                                <p className={`text-sm lg:text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} truncate`}>{user?.role}</p>
                            </div>
                        )}
                        {sidebarOpen && (
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
                {/* Header */}
                <header className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b h-14 lg:h-10 flex items-center justify-between px-4 header-mobile`}>
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
                            <h2 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Abcotronics</h2>
                        </div>
                    </div>
                    <div className="flex items-center space-x-2">
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
                    {renderPage()}
                </main>
                {/* Global Feedback Widget */}
                {window.FeedbackWidget ? <window.FeedbackWidget /> : null}
                
                {/* Password Change Modal */}
                {PasswordChangeModal && showPasswordChangeModal ? <PasswordChangeModal /> : null}
            </div>
        </div>
    );
};

// Make available globally
window.MainLayout = MainLayout;
