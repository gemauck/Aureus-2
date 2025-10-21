// Get React hooks from window
const { createContext, useContext, useState, useEffect } = React;

// Get storage from window
const storage = window.storage;

// Auth Context
const AuthContext = createContext();

const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const init = async () => {
            try {
                const storedUser = storage.getUser();
                if (storedUser) setUser(storedUser);
                // Try refresh + me if token not present but refresh cookie exists
                if (!window.storage.getToken) return setLoading(false);
                if (!window.storage.getToken()) {
                    try { await window.api.refresh(); } catch {}
                }
                if (window.storage.getToken && window.storage.getToken()) {
                    try {
                        const me = await window.api.me();
                        if (me) { storage.setUser(me); setUser(me); }
                    } catch {}
                }
            } finally {
                setLoading(false);
            }
        };
        init();
    }, []);

    const login = async (email, password) => {
        try {
            console.log('🔐 Attempting login for:', email);
            const loginResult = await window.api.login(email, password);
            console.log('✅ Login API successful:', loginResult);
            
            const me = await window.api.me();
            console.log('✅ Me API successful:', me);
            
            storage.setUser(me);
            setUser(me);
            
            if (window.AuditLogger) {
                window.AuditLogger.log('login', 'authentication', { email: me.email, loginMethod: 'email_password' }, me);
            }
            
            // Start live data sync on successful login (with a small delay to ensure token is set)
            if (window.LiveDataSync) {
                setTimeout(() => {
                    window.LiveDataSync.start();
                }, 100);
            }
            
            console.log('🎉 Login flow completed successfully');
            return me;
        } catch (err) {
            console.error('❌ Login error details:', {
                message: err.message,
                stack: err.stack,
                name: err.name
            });
            throw new Error('Invalid credentials');
        }
    };

    const loginWithGoogle = () => {
        const users = storage.getUsers() || [];
        const demoUser = users.find(u => u.status === 'Active') || {
            id: 'demo-1',
            name: 'Demo User',
            email: 'demo@abcotronics.com',
            role: 'viewer',
            department: 'Demo',
            status: 'Active'
        };

        const mockUser = {
            id: demoUser.id,
            name: demoUser.name,
            email: demoUser.email,
            role: demoUser.role === 'admin' ? 'Admin' : 'User',
            avatar: null,
            department: demoUser.department
        };
        
        storage.setUser(mockUser);
        setUser(mockUser);
        return Promise.resolve(mockUser);
    };

    const loginWithMicrosoft = () => {
        const users = storage.getUsers() || [];
        const demoUser = users.find(u => u.status === 'Active') || {
            id: 'demo-2',
            name: 'Demo User',
            email: 'demo@abcotronics.com',
            role: 'viewer',
            department: 'Demo',
            status: 'Active'
        };

        const mockUser = {
            id: demoUser.id,
            name: demoUser.name,
            email: demoUser.email,
            role: demoUser.role === 'admin' ? 'Admin' : 'User',
            avatar: null,
            department: demoUser.department
        };
        
        storage.setUser(mockUser);
        setUser(mockUser);
        return Promise.resolve(mockUser);
    };

    const logout = async () => {
        if (window.AuditLogger && user) {
            window.AuditLogger.log('logout', 'authentication', { email: user.email }, user);
        }
        await window.api.logout();
        storage.removeUser();
        if (window.storage.removeToken) window.storage.removeToken();
        setUser(null);
        
        // Stop live data sync on logout
        if (window.LiveDataSync) {
            window.LiveDataSync.stop();
        }
    };

    return (
        <AuthContext.Provider value={{ user, login, loginWithGoogle, loginWithMicrosoft, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

const useAuth = () => useContext(AuthContext);

// Make available globally
window.AuthContext = AuthContext;
window.AuthProvider = AuthProvider;
window.useAuth = useAuth;
