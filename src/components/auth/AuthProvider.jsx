// Get React hooks from window
const { createContext, useContext, useState, useEffect, useCallback } = React;

// Get storage from window
const storage = window.storage;

// Auth Context
const AuthContext = createContext();

const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const isRefreshingRef = React.useRef(false);

    const refreshUser = useCallback(async () => {
        // Prevent multiple simultaneous refresh calls
        if (isRefreshingRef.current) {
            return null;
        }
        
        isRefreshingRef.current = true;
        try {
            if (!window.storage || !window.storage.getToken) {
                console.error('🚨 refreshUser: No storage or getToken available');
                return null;
            }
            
            const token = window.storage.getToken();
            if (token && window.api && window.api.me) {
                const meResponse = await window.api.me();
                console.error('🚨 refreshUser: API.me() response:', meResponse);
                if (meResponse) {
                    // Extract user from response (API returns { data: { user: {...} } } or { user: {...} } or direct user object)
                    const user = meResponse.data?.user || meResponse.user || meResponse.data || meResponse;
                    console.error('🚨 refreshUser: Extracted user:', user, 'Role:', user?.role);
                    if (user) {
                        storage.setUser(user);
                        setUser(user);
                        return user;
                    }
                }
            } else {
                console.warn('🚨 refreshUser: No token or API.me available, falling back to storage');
                // Fallback to storage
                const storedUser = storage.getUser();
                if (storedUser) {
                    setUser(storedUser);
                    return storedUser;
                }
            }
        } catch (err) {
            console.error('🚨 refreshUser: Error:', err, err.message, err.stack);
            // Fallback to storage
            const storedUser = storage.getUser();
            if (storedUser) {
                setUser(storedUser);
                return storedUser;
            }
        } finally {
            isRefreshingRef.current = false;
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
                    // Save token
                    if (window.storage && window.storage.setToken) {
                        window.storage.setToken(token);
                    }
                    
                    // Fetch user data
                    if (window.api && window.api.me) {
                        try {
                            const meResponse = await window.api.me();
                            if (meResponse) {
                                // Extract user from response (API returns { data: { user: {...} } })
                                const user = meResponse.data?.user || meResponse.user || meResponse.data || meResponse;
                                if (user) {
                                    storage.setUser(user);
                                    setUser(user);
                                    
                                    // Clean up URL but preserve hash (e.g. from email deep link opened in same tab before login)
                                    const hash = window.location.hash || '';
                                    const cleanPath = window.location.pathname || '/';
                                    const nextUrl = hash ? cleanPath + hash : cleanPath;
                                    window.history.replaceState({}, document.title, nextUrl);
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
                    // Silently fail if no refresh token is available
                    if (window.api && window.api.refresh) {
                        try {
                            const refreshResult = await Promise.race([
                                window.api.refresh(),
                                new Promise((_, reject) => setTimeout(() => reject(new Error('Refresh timeout')), 5000))
                            ]);
                            // Only warn if refresh was attempted but failed (timeout)
                            if (!refreshResult && refreshResult !== null) {
                                console.warn('Refresh timeout');
                            }
                        } catch (err) {
                            // Silently ignore refresh failures - they're expected when no refresh cookie exists
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
                                const user = meResponse.data?.user || meResponse.user || meResponse.data || meResponse;
                                if (user) {
                                    storage.setUser(user);
                                    setUser(user);
                                    const log = window.debug?.log || (() => {});
                                    log('✅ User loaded from API');
                                }
                            }
                        } catch (err) {
                            const errorMessage = err?.message || String(err);
                            const errorStatus = err?.status || err?.response?.status;
                            
                            // Handle 503 Service Unavailable (database connection issues)
                            if (errorStatus === 503 || errorMessage.includes('Service Unavailable') || errorMessage.includes('Database connection')) {
                                console.error('🔌 Database connection issue detected - service unavailable');
                                // Don't clear token on database connection errors - it's a server issue, not auth issue
                                // Return null to indicate user couldn't be loaded, but don't force logout
                                setUser(null);
                                setLoading(false);
                                return;
                            }
                            
                            // Handle "User not found" error - means token is valid but user doesn't exist (orphaned token)
                            if (errorMessage.includes('User not found')) {
                                console.warn('⚠️ User not found in database - clearing orphaned token');
                                // Clear token and user data since user doesn't exist
                                if (window.storage?.removeToken) window.storage.removeToken();
                                if (window.storage?.removeUser) window.storage.removeUser();
                                setUser(null);
                                return; // Don't try to use stored user if API says user doesn't exist
                            }
                            
                            // Check if it's a database connection error or timeout - treat like successful timeout
                            const isDatabaseError = errorMessage.includes('Database connection failed') ||
                                                  errorMessage.includes('unreachable') ||
                                                  errorMessage.includes('Me API timeout') ||
                                                  errorMessage.includes('timeout') ||
                                                  errorMessage.includes('ECONNREFUSED') ||
                                                  errorMessage.includes('ETIMEDOUT');
                            
                            // Only log if it's not a 401, timeout, or database error - these are expected
                            if (errorMessage && 
                                !errorMessage.includes('401') && 
                                !errorMessage.includes('Unauthorized') &&
                                !isDatabaseError) {
                                console.warn('Me API failed:', errorMessage);
                            }
                            
                            // If we have a stored user and no user was loaded from API, ensure stored user is set
                            // This handles both timeouts and database connection errors gracefully
                            // Always use storedUser if available when API fails (database down or timeout)
                            if (storedUser) {
                                setUser(storedUser);
                                const log = window.debug?.log || (() => {});
                                log('✅ Using stored user due to API failure');
                            }
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

    // Session validation - validate session when user returns to page after being away
    useEffect(() => {
        if (!user) return;

        let lastValidationTime = Date.now();
        const VALIDATION_COOLDOWN = 30000; // Don't re-validate within 30 seconds
        const STALE_SESSION_THRESHOLD = 6 * 60 * 60 * 1000; // 6 hours - consider session potentially stale

        const validateSession = async () => {
            const token = window.storage?.getToken?.();
            
            // No token means we should already be logged out
            if (!token) {
                if (window.forceLogout) {
                    window.forceLogout('NO_TOKEN');
                }
                return;
            }

            // Skip validation if we just validated recently
            const now = Date.now();
            if (now - lastValidationTime < VALIDATION_COOLDOWN) {
                return;
            }

            try {
                // Try to validate the session with the server
                const meResponse = await Promise.race([
                    window.api.me(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Session validation timeout')), 10000))
                ]);

                if (meResponse) {
                    const validatedUser = meResponse.data?.user || meResponse.user || meResponse.data || meResponse;
                    if (validatedUser) {
                        // Session is valid - update user data if needed
                        storage.setUser(validatedUser);
                        setUser(validatedUser);
                        lastValidationTime = now;
                        return;
                    }
                }
                
                // If we got here with no user data, session is invalid
                if (window.forceLogout) {
                    window.forceLogout('SESSION_INVALID');
                }
            } catch (err) {
                const errorMessage = err?.message || String(err);
                
                // 401/Unauthorized means session expired - force logout
                if (errorMessage.includes('401') || errorMessage.includes('Unauthorized') || errorMessage.includes('User not found')) {
                    if (window.forceLogout) {
                        window.forceLogout('SESSION_EXPIRED');
                    }
                    return;
                }

                // Database/network errors - don't force logout, but warn user
                const isNetworkError = errorMessage.includes('Database connection failed') ||
                                      errorMessage.includes('unreachable') ||
                                      errorMessage.includes('timeout') ||
                                      errorMessage.includes('ECONNREFUSED') ||
                                      errorMessage.includes('connection refused') ||
                                      errorMessage.includes('failed to fetch') ||
                                      errorMessage.includes('ETIMEDOUT') ||
                                      errorMessage.includes('502') ||
                                      errorMessage.includes('503') ||
                                      errorMessage.includes('504');
                const isConnectionRefused = errorMessage.includes('connection refused') ||
                                           errorMessage.includes('ECONNREFUSED') ||
                                           errorMessage.includes('econnrefused') ||
                                           errorMessage.includes('is the server running');

                if (isNetworkError) {
                    console.warn('⚠️ Could not validate session - server unreachable. Working in offline mode.');
                    // Dispatch event so UI can show offline indicator; pass actionable message when connection refused
                    window.dispatchEvent(new CustomEvent('auth:server-unreachable', {
                        detail: isConnectionRefused ? { message: 'Connection refused. Is the server running? Run: npm run dev:backend — then open http://localhost:3000 (or the port shown in the terminal).' } : {}
                    }));
                } else {
                    console.error('❌ Session validation error:', errorMessage);
                }
            }
        };

        // Validate session when user returns to tab after being away
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && user && window.storage?.getToken?.()) {
                // Check how long the page was hidden
                const hiddenDuration = Date.now() - lastValidationTime;
                
                // If page was hidden for more than the threshold, validate session
                if (hiddenDuration >= STALE_SESSION_THRESHOLD) {
                    validateSession();
                }
            }
        };

        // Also validate on focus (catches browser restore, etc.)
        const handleFocus = () => {
            if (user && window.storage?.getToken?.()) {
                const timeSinceValidation = Date.now() - lastValidationTime;
                if (timeSinceValidation >= STALE_SESSION_THRESHOLD) {
                    validateSession();
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleFocus);

        // Cleanup
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleFocus);
        };
    }, [user]);

    // Heartbeat effect - send periodic pings to track online status
    useEffect(() => {
        if (!user || !window.api || !window.api.heartbeat) {
            return;
        }

        // Send initial heartbeat after a delay to avoid immediate requests on page load
        setTimeout(() => {
            if (user && window.storage?.getToken?.()) {
                // Check for global rate limits before sending heartbeat
                if (!window.RateLimitManager || !window.RateLimitManager.isRateLimited()) {
                    window.api.heartbeat();
                }
            }
        }, 60000); // Wait 1 minute before first heartbeat

        // Set up interval to send heartbeats every 5 minutes (300000ms) - increased to reduce API load and rate limiting
        const heartbeatInterval = setInterval(() => {
            if (user && window.storage?.getToken?.()) {
                // Check rate limit before sending heartbeat
                if (window.RateLimitManager && window.RateLimitManager.isRateLimited()) {
                    const waitSeconds = window.RateLimitManager.getWaitTimeRemaining();
                    const waitMinutes = Math.round(waitSeconds / 60);
                    // Silently skip heartbeat if rate limited (don't log to reduce noise)
                    return;
                }
                window.api.heartbeat();
            }
        }, 300000); // 5 minutes (increased from 3 minutes to reduce rate limiting)

        // Cleanup
        return () => {
            clearInterval(heartbeatInterval);
        };
    }, [user]);

    // Listen for user data updates with debouncing to prevent rapid-fire refreshes
    useEffect(() => {
        let debounceTimer = null;
        
        const handleUserUpdate = () => {
            // Debounce: only refresh if no refresh happened in the last 500ms
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }
            debounceTimer = setTimeout(() => {
                refreshUser();
            }, 500);
        };

        window.addEventListener('userDataUpdated', handleUserUpdate);
        return () => {
            window.removeEventListener('userDataUpdated', handleUserUpdate);
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }
        };
    }, [refreshUser]);

    const login = async (email, password) => {
        try {
            const loginResult = await window.api.login(email, password);
            
            // Check if login response contains an error
            if (loginResult?.error) {
                throw new Error(loginResult.error.message || 'Login failed');
            }
            
            // Verify we got a token
            if (!loginResult?.accessToken && !loginResult?.data?.accessToken) {
                throw new Error('No access token received from login');
            }
            
            
            const meResponse = await window.api.me();
            
            // Extract user from response (API returns { user: {...} } or direct user object)
            const user = meResponse.user || meResponse?.data?.user || meResponse?.data || meResponse;
            if (!user || !user.id) {
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
            
            
            // Check if password change is required (from login response or user data)
            const requiresPasswordChange = loginResult.mustChangePassword || user.mustChangePassword;
            
            if (requiresPasswordChange) {
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
                name: err.name,
                status: err.status,
                retryAfter: err.retryAfter
            });
            
            // Handle rate limiting errors specifically
            if (err.status === 429 || err.code === 'RATE_LIMIT_EXCEEDED') {
                const retryAfter = err.retryAfter || 900; // Default to 15 minutes
                const minutes = Math.ceil(retryAfter / 60);
                throw new Error(`Too many login attempts. Please wait ${minutes} minute${minutes !== 1 ? 's' : ''} before trying again.`);
            }
            
            throw new Error(err.message || 'Invalid credentials');
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
    }
    
    // Verify storage is available
    if (!window.storage && (!window.debug || !window.debug.performanceMode)) {
        console.warn('⚠️ Storage not available when AuthProvider.jsx executed');
    }
} catch (error) {
    console.error('❌ AuthProvider.jsx: Error registering component:', error);
}
