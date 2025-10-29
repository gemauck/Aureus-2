// Get React hooks from window
const { createContext, useContext, useState, useEffect, useCallback } = React;

// Get storage from window
const storage = window.storage;

// Auth Context
const AuthContext = createContext();

const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const refreshUser = useCallback(async () => {
        try {
            if (!window.storage || !window.storage.getToken) {
                return;
            }
            
            const token = window.storage.getToken();
            if (token && window.api && window.api.me) {
                const meResponse = await window.api.me();
                if (meResponse) {
                    // Extract user from response (API returns { user: {...} } or direct user object)
                    const user = meResponse.user || meResponse;
                    if (user) {
                        storage.setUser(user);
                        setUser(user);
                        return user;
                    }
                }
            } else {
                // Fallback to storage
                const storedUser = storage.getUser();
                if (storedUser) {
                    setUser(storedUser);
                    return storedUser;
                }
            }
        } catch (err) {
            console.warn('Refresh user failed:', err.message);
            // Fallback to storage
            const storedUser = storage.getUser();
            if (storedUser) {
                setUser(storedUser);
                return storedUser;
            }
        }
        return null;
    }, []);

    useEffect(() => {
        const init = async () => {
            try {
                // Check for Google OAuth redirect with token
                const urlParams = new URLSearchParams(window.location.search);
                const loginSuccess = urlParams.get('login');
                const token = urlParams.get('token');
                
                if (loginSuccess === 'success' && token) {
                    console.log('🔐 Google OAuth login detected, processing token...');
                    // Save token
                    if (window.storage && window.storage.setToken) {
                        window.storage.setToken(token);
                    }
                    
                    // Fetch user data
                    if (window.api && window.api.me) {
                        try {
                            const meResponse = await window.api.me();
                            if (meResponse) {
                                // Extract user from response
                                const user = meResponse.user || meResponse;
                                if (user) {
                                    storage.setUser(user);
                                    setUser(user);
                                    console.log('✅ User loaded from OAuth:', user.name, user.email);
                                    
                                    // Clean up URL
                                    window.history.replaceState({}, document.title, window.location.pathname);
                                }
                            }
                        } catch (err) {
                            console.error('Failed to load user after OAuth:', err);
                        }
                    }
                }
                
                // Safety check for storage
                if (!storage || !storage.getUser) {
                    console.warn('⚠️ Storage not available, skipping auth init');
                    setLoading(false);
                    return;
                }
                
                const storedUser = storage.getUser();
                const log = window.debug?.log || (() => {});
                if (storedUser) {
                    setUser(storedUser);
                    log('✅ User restored from storage');
                }
                
                // Try refresh + me if token not present but refresh cookie exists
                if (!window.storage || !window.storage.getToken) {
                    setLoading(false);
                    return;
                }
                
                if (!window.storage.getToken()) {
                    // Try refresh if no token but might have refresh cookie
                    if (window.api && window.api.refresh) {
                        try {
                            await Promise.race([
                                window.api.refresh(),
                                new Promise((_, reject) => setTimeout(() => reject(new Error('Refresh timeout')), 5000))
                            ]);
                        } catch (err) {
                            console.warn('Refresh failed or timed out:', err.message);
                        }
                    }
                }
                
                if (window.storage.getToken && window.storage.getToken()) {
                    if (window.api && window.api.me) {
                        try {
                            const meResponse = await Promise.race([
                                window.api.me(),
                                new Promise((_, reject) => setTimeout(() => reject(new Error('Me API timeout')), 5000))
                            ]);
                            if (meResponse) {
                                // Extract user from response (API returns { user: {...} } or direct user object)
                                const user = meResponse.user || meResponse;
                                if (user) {
                                    storage.setUser(user);
                                    setUser(user);
                                    const log = window.debug?.log || (() => {});
                                    log('✅ User loaded from API');
                                }
                            }
                        } catch (err) {
                            console.warn('Me API failed or timed out:', err.message);
                        }
                    }
                }
            } catch (error) {
                console.error('❌ Auth initialization error:', error);
            } finally {
                setLoading(false);
                const log = window.debug?.log || (() => {});
                log('✅ Auth initialization complete');
            }
        };
        init();
    }, []);

    // Heartbeat effect - send periodic pings to track online status
    useEffect(() => {
        if (!user || !window.api || !window.api.heartbeat) {
            return;
        }

        // Send initial heartbeat
        window.api.heartbeat();

        // Set up interval to send heartbeats every 2 minutes (120000ms)
        const heartbeatInterval = setInterval(() => {
            if (user && window.storage?.getToken?.()) {
                window.api.heartbeat();
            }
        }, 120000); // 2 minutes

        // Also send heartbeat on visibility change (when user returns to tab)
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && user && window.storage?.getToken?.()) {
                window.api.heartbeat();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Cleanup
        return () => {
            clearInterval(heartbeatInterval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [user]);

    // Listen for user data updates
    useEffect(() => {
        const handleUserUpdate = () => {
            refreshUser();
        };

        window.addEventListener('userDataUpdated', handleUserUpdate);
        return () => window.removeEventListener('userDataUpdated', handleUserUpdate);
    }, [refreshUser]);

    const login = async (email, password) => {
        try {
            console.log('🔐 Attempting login for:', email);
            const loginResult = await window.api.login(email, password);
            console.log('✅ Login API successful:', loginResult);
            
            const meResponse = await window.api.me();
            console.log('✅ Me API successful:', meResponse);
            
            // Extract user from response (API returns { user: {...} } or direct user object)
            const user = meResponse.user || meResponse;
            if (!user) {
                throw new Error('Failed to get user data from API');
            }
            
            storage.setUser(user);
            setUser(user);
            
            if (window.AuditLogger) {
                window.AuditLogger.log('login', 'authentication', { email: user.email, loginMethod: 'email_password' }, user);
            }
            
            // Start live data sync on successful login (with a small delay to ensure token is set)
            if (window.LiveDataSync) {
                setTimeout(() => {
                    window.LiveDataSync.start();
                }, 100);
            }
            
            console.log('🎉 Login flow completed successfully');
            
            // Check if password change is required (from login response or user data)
            const requiresPasswordChange = loginResult.mustChangePassword || user.mustChangePassword;
            
            if (requiresPasswordChange) {
                console.log('🔒 Password change required for user:', email);
                // Trigger password change modal
                setTimeout(() => {
                    if (window.triggerPasswordChangeModal) {
                        window.triggerPasswordChangeModal();
                    }
                }, 500);
            }
            
            return { user: user, mustChangePassword: requiresPasswordChange || false };
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
        <AuthContext.Provider value={{ user, login, loginWithGoogle, loginWithMicrosoft, logout, loading, refreshUser }}>
            {children}
        </AuthContext.Provider>
    );
};

const useAuth = () => useContext(AuthContext);

// Make available globally
try {
    window.AuthContext = AuthContext;
    window.AuthProvider = AuthProvider;
    window.useAuth = useAuth;
    if (window.debug && !window.debug.performanceMode) {
        console.log('✅ AuthProvider.jsx loaded and registered', typeof window.AuthProvider);
    }
    
    // Verify storage is available
    if (!window.storage && (!window.debug || !window.debug.performanceMode)) {
        console.warn('⚠️ Storage not available when AuthProvider.jsx executed');
    }
} catch (error) {
    console.error('❌ AuthProvider.jsx: Error registering component:', error);
}
