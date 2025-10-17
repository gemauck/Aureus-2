// Use React from window
const { useState } = React;

const MainLayout = () => {
    const [currentPage, setCurrentPage] = useState('dashboard');
    const [sidebarOpen, setSidebarOpen] = useState(false); // Start closed on mobile
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const { user, logout } = window.useAuth();
    const { theme, toggleTheme, isDark } = window.useTheme();

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
                setCurrentPage(event.detail.page);
            }
        };
        
        window.addEventListener('navigateToPage', handleNavigate);
        return () => window.removeEventListener('navigateToPage', handleNavigate);
    }, []);

    // Get components from window
    const Dashboard = window.Dashboard;
    const Clients = window.Clients;
    const Pipeline = window.Pipeline;
    const Projects = window.Projects;
    const Teams = window.Teams;
    const Users = window.Users;
    const TimeTracking = window.TimeTracking;
    const HR = window.HR;
    const Manufacturing = window.Manufacturing;
    const Tools = window.Tools;
    const Reports = window.Reports;

    const menuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: 'fa-th-large' },
        { id: 'clients', label: 'Clients', icon: 'fa-users' },
        { id: 'projects', label: 'Projects', icon: 'fa-project-diagram' },
        { id: 'teams', label: 'Teams', icon: 'fa-user-friends' },
        { id: 'users', label: 'Users', icon: 'fa-user-cog' },
        { id: 'time', label: 'Time Tracking', icon: 'fa-clock' },
        { id: 'hr', label: 'HR', icon: 'fa-id-card' },
        { id: 'manufacturing', label: 'Manufacturing', icon: 'fa-industry' },
        { id: 'tools', label: 'Tools', icon: 'fa-toolbox' },
        { id: 'documents', label: 'Documents', icon: 'fa-folder-open' },
        { id: 'reports', label: 'Reports', icon: 'fa-chart-bar' },
    ];

    const renderPage = () => {
        switch(currentPage) {
            case 'dashboard': 
                return Dashboard ? <Dashboard /> : <div>Loading Dashboard...</div>;
            case 'clients': 
                return Clients ? <Clients /> : <div>Loading Clients...</div>;
            case 'projects': 
                return Projects ? <Projects /> : <div>Loading Projects...</div>;
            case 'teams': 
                return Teams ? <Teams /> : <div className="text-center py-12 text-gray-500">Teams module - Coming soon!</div>;
            case 'users': 
                return Users ? <Users /> : <div>Loading Users...</div>;
            case 'time': 
                return TimeTracking ? <TimeTracking /> : <div>Loading Time Tracking...</div>;
            case 'hr': 
                return HR ? <HR /> : <div>Loading HR...</div>;
            case 'manufacturing': 
                return Manufacturing ? <Manufacturing /> : <div>Loading Manufacturing...</div>;
            case 'tools': 
                return Tools ? <Tools /> : <div>Loading Tools...</div>;
            case 'reports': 
                return Reports ? <Reports /> : <div>Loading Reports...</div>;
            case 'documents': 
                return <div className="text-center py-12 text-gray-500">Documents module - Coming soon!</div>;
            default: 
                return Dashboard ? <Dashboard /> : <div>Loading...</div>;
        }
    };

    return (
        <div className={`flex h-screen ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
            {/* Mobile Overlay */}
            {mobileMenuOpen && (
                <div 
                    className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
                    onClick={() => setMobileMenuOpen(false)}
                ></div>
            )}

            {/* Sidebar */}
            <div className={`
                ${sidebarOpen ? 'w-48' : 'w-12'} 
                ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} 
                border-r transition-all duration-300 flex flex-col
                ${mobileMenuOpen ? 'fixed inset-y-0 left-0 z-50 lg:relative lg:z-auto' : 'hidden lg:flex'}
                lg:flex
            `}>
                {/* Logo */}
                <div className={`h-12 flex items-center justify-between px-3 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                    {sidebarOpen ? (
                        <div>
                            <h1 className="text-sm font-bold text-primary-600">Abcotronics</h1>
                            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>ERP</p>
                        </div>
                    ) : (
                        <div className="text-sm font-bold text-primary-600">A</div>
                    )}
                    <button 
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className={`${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'} p-1 rounded transition-colors`}
                    >
                        <i className={`fas fa-${sidebarOpen ? 'chevron-left' : 'chevron-right'} text-sm`}></i>
                    </button>
                </div>

                {/* Menu Items */}
                <nav className="flex-1 overflow-y-auto sidebar-scrollbar py-1.5">
                    {menuItems.map(item => (
                        <button
                            key={item.id}
                            onClick={() => setCurrentPage(item.id)}
                            className={`w-full flex items-center px-2 py-1.5 transition-colors text-xs ${
                                currentPage === item.id 
                                    ? 'bg-primary-50 text-primary-600 border-r-2 border-primary-600' 
                                    : isDark 
                                        ? 'text-gray-300 hover:bg-gray-700' 
                                        : 'text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            <i className={`fas ${item.icon} ${sidebarOpen ? 'mr-2' : ''} w-3 text-xs`}></i>
                            {sidebarOpen && <span className="font-medium">{item.label}</span>}
                        </button>
                    ))}
                </nav>

                {/* User Profile */}
                <div className="border-t border-gray-200 p-2">
                    <div className="flex items-center">
                        <div className="w-6 h-6 rounded-full bg-primary-600 flex items-center justify-center text-white font-semibold text-xs">
                            {user?.name?.charAt(0) || 'U'}
                        </div>
                        {sidebarOpen && (
                            <div className="ml-2 flex-1 min-w-0">
                                <p className="text-xs font-medium text-gray-700 truncate">{user?.name}</p>
                                <p className="text-xs text-gray-500 truncate">{user?.role}</p>
                            </div>
                        )}
                        {sidebarOpen && (
                            <button 
                                onClick={logout}
                                className="text-gray-500 hover:text-gray-700 p-1 hover:bg-gray-100 rounded transition-colors"
                                title="Logout"
                            >
                                <i className="fas fa-sign-out-alt text-xs"></i>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-auto">
                {/* Header */}
                <header className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b h-10 flex items-center justify-between px-4`}>
                    <div className="flex items-center">
                        <button 
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            className={`lg:hidden ${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'} mr-2 p-2 rounded transition-colors`}
                        >
                            <i className="fas fa-bars text-sm"></i>
                        </button>
                        <div className="relative">
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
                    </div>
                    <div className="flex items-center space-x-2">
                        <button 
                            onClick={toggleTheme}
                            className={`${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'} p-1 rounded transition-colors`}
                            title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
                        >
                            <i className={`fas fa-${isDark ? 'sun' : 'moon'} text-sm`}></i>
                        </button>
                        <button className={`relative ${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'} p-1 rounded transition-colors`}>
                            <i className="fas fa-bell text-sm"></i>
                            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[8px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-medium">3</span>
                        </button>
                        <button className={`${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'} p-1 rounded transition-colors`}>
                            <i className="fas fa-cog text-sm"></i>
                        </button>
                    </div>
                </header>

                {/* Page Content */}
                <main className="p-2 sm:p-4 overflow-x-auto">
                    {renderPage()}
                </main>
            </div>
        </div>
    );
};

// Make available globally
window.MainLayout = MainLayout;
