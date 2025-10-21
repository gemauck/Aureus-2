// Get React hooks from window
const { useState, useEffect } = React;

// Get useAuth from window
const useAuth = window.useAuth;
const storage = window.storage;

const LoginPage = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        
        if (!email || !password) {
            setError('Please enter both email and password');
            return;
        }

        try {
            await login(email, password);
        } catch (err) {
            setError('Invalid credentials');
        }
    };

    const handleQuickLogin = (user) => {
        // Map user roles to system roles
        const roleMapping = {
            'admin': 'Admin',
            'manager': 'Manager',
            'accountant': 'Accountant',
            'project_manager': 'Project Manager',
            'team_member': 'Team Member',
            'viewer': 'Viewer'
        };

        const loginUser = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: roleMapping[user.role] || 'User',
            avatar: null,
            department: user.department
        };
        
        storage.setUser(loginUser);
        
        // Log the login action
        if (window.AuditLogger) {
            window.AuditLogger.log('login', 'authentication', {
                email: user.email,
                loginMethod: 'quick_select'
            }, loginUser);
        }
        
        window.location.reload(); // Refresh to load the user
    };

    const getRoleBadgeColor = (role) => {
        const colors = {
            'admin': 'bg-red-100 text-red-700',
            'manager': 'bg-blue-100 text-blue-700',
            'accountant': 'bg-green-100 text-green-700',
            'project_manager': 'bg-purple-100 text-purple-700',
            'team_member': 'bg-orange-100 text-orange-700',
            'viewer': 'bg-gray-100 text-gray-700'
        };
        return colors[role] || 'bg-gray-100 text-gray-700';
    };

    const getRoleName = (role) => {
        const names = {
            'admin': 'Administrator',
            'manager': 'Manager',
            'accountant': 'Accountant',
            'project_manager': 'Project Manager',
            'team_member': 'Team Member',
            'viewer': 'Viewer'
        };
        return names[role] || role;
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-blue-700 p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl overflow-hidden">
                <div className="grid md:grid-cols-2">
                    {/* Left Side - Branding */}
                    <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-8 text-white flex flex-col justify-center">
                        <div className="mb-8">
                            <h1 className="text-3xl font-bold mb-2">Abcotronics ERP</h1>
                        </div>
                    </div>

                    {/* Right Side - Login */}
                    <div className="p-8">
                        <div className="mb-6">
                            <h2 className="text-2xl font-bold text-gray-900 mb-1">Welcome Back</h2>
                            <p className="text-sm text-gray-600">Sign in to access your dashboard</p>
                        </div>

                        {/* Tab Toggle */}
                        <div className="flex gap-2 mb-6 border-b border-gray-200">
                            <button
                                onClick={() => setShowQuickSelect(true)}
                                className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                                    showQuickSelect
                                        ? 'border-blue-600 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                Quick Select
                            </button>
                            <button
                                onClick={() => setShowQuickSelect(false)}
                                className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                                    !showQuickSelect
                                        ? 'border-blue-600 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                Email Login
                            </button>
                        </div>

                        {showQuickSelect ? (
                            // Quick Select View
                            <div className="space-y-3">
                                <p className="text-xs text-gray-600 mb-3">Select a user to login (for testing/demo)</p>
                                {availableUsers.length > 0 ? (
                                    availableUsers.map(user => (
                                        <button
                                            key={user.id}
                                            onClick={() => handleQuickLogin(user)}
                                            className="w-full text-left p-3 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition group"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                                                        {user.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <div className="font-semibold text-gray-900 text-sm">{user.name}</div>
                                                        <div className="text-xs text-gray-600">{user.email}</div>
                                                        {user.department && (
                                                            <div className="text-xs text-gray-500 mt-0.5">
                                                                <i className="fas fa-building text-[10px] mr-1"></i>
                                                                {user.department}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end gap-1">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${getRoleBadgeColor(user.role)}`}>
                                                        {getRoleName(user.role)}
                                                    </span>
                                                    <i className="fas fa-arrow-right text-gray-400 group-hover:text-blue-600 transition text-xs"></i>
                                                </div>
                                            </div>
                                        </button>
                                    ))
                                ) : (
                                    <div className="text-center py-8 text-gray-500">
                                        <i className="fas fa-users text-3xl mb-2 opacity-50"></i>
                                        <p className="text-sm">No users available</p>
                                        <p className="text-xs mt-1">Go to User Management to create users</p>
                                    </div>
                                )}
                                <div className="mt-4">
                                    <a href="/api/auth/google/start" className="w-full inline-flex items-center justify-center gap-2 bg-white border border-gray-300 text-gray-700 py-2 text-sm rounded-lg hover:bg-gray-50 transition font-medium">
                                        <i className="fab fa-google"></i>
                                        Sign in with Google
                                    </a>
                                </div>
                            </div>
                        ) : (
                            // Email Login Form
                            <form onSubmit={handleSubmit} className="space-y-4">
                                {error && (
                                    <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                                        {error}
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                        Email Address
                                    </label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="you@company.com"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                        Password
                                    </label>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="••••••••"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    className="w-full bg-blue-600 text-white py-2 text-sm rounded-lg hover:bg-blue-700 transition font-medium"
                                >
                                    Sign In
                                </button>
                                
                                {/* Divider */}
                                <div className="relative my-4">
                                    <div className="absolute inset-0 flex items-center">
                                        <div className="w-full border-t border-gray-300"></div>
                                    </div>
                                    <div className="relative flex justify-center text-sm">
                                        <span className="px-2 bg-white text-gray-500">or</span>
                                    </div>
                                </div>
                                
                                {/* Google OAuth */}
                                <a 
                                    href="/api/auth/google/start" 
                                    className="w-full inline-flex items-center justify-center gap-2 bg-white border border-gray-300 text-gray-700 py-2 text-sm rounded-lg hover:bg-gray-50 transition font-medium"
                                >
                                    <i className="fab fa-google text-red-500"></i>
                                    Sign in with Google (Abcotronics)
                                </a>
                            </form>
                        )}

                        {/* Footer Note */}
                        <div className="mt-6 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                            <div className="flex items-start gap-2">
                                <i className="fas fa-info-circle text-blue-600 text-sm mt-0.5"></i>
                                <div>
                                    <p className="text-xs text-blue-900 font-medium">Prototype Mode</p>
                                    <p className="text-xs text-blue-700 mt-0.5">
                                        This is a local prototype. Use "Quick Select" to test different user roles and permissions.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Make available globally
window.LoginPage = LoginPage;
