// Get React hooks from window
const { createContext, useContext, useState, useEffect, useCallback, useRef } = React;

// Data Context - Central data management with intelligent caching
const DataContext = createContext();

// Cache configuration - TTL (time to live) in milliseconds
const CACHE_CONFIG = {
    clients: { ttl: 1800000 }, // 30 minutes
    leads: { ttl: 600000 },    // 10 minutes  
    projects: { ttl: 1800000 }, // 30 minutes
    timeEntries: { ttl: 600000 }, // 10 minutes
    invoices: { ttl: 1800000 }, // 30 minutes
    employees: { ttl: 1800000 }, // 30 minutes
    users: { ttl: 1800000 }, // 30 minutes
    dashboard: { ttl: 900000 }, // 15 minutes
    inventory: { ttl: 300000 }, // 5 minutes
};

const DataProvider = ({ children }) => {
    // Cache state - stores data with timestamp and TTL
    const [cache, setCache] = useState(() => {
        const initialCache = {};
        Object.keys(CACHE_CONFIG).forEach(key => {
            initialCache[key] = {
                data: null,
                timestamp: null,
                ttl: CACHE_CONFIG[key].ttl,
                loading: false,
                error: null
            };
        });
        return initialCache;
    });

    // Global loading state
    const [globalLoading, setGlobalLoading] = useState(false);
    
    // Track if initial load is complete
    const [initialLoadComplete, setInitialLoadComplete] = useState(false);
    
    // Prevent duplicate fetches
    const fetchingRef = useRef(new Set());

    // Check if cache is still valid
    const isCacheValid = useCallback((key) => {
        const cached = cache[key];
        if (!cached.data || !cached.timestamp) return false;
        return Date.now() - cached.timestamp < cached.ttl;
    }, [cache]);

    // Get cache status for debugging
    const getCacheStatus = useCallback(() => {
        const status = {};
        Object.keys(cache).forEach(key => {
            const c = cache[key];
            status[key] = {
                hasData: !!c.data,
                age: c.timestamp ? Math.round((Date.now() - c.timestamp) / 1000) : null,
                valid: isCacheValid(key),
                loading: c.loading,
                error: c.error
            };
        });
        return status;
    }, [cache, isCacheValid]);

    // Helper to wait for DatabaseAPI if needed
    const waitForDatabaseAPI = useCallback(async (maxWait = 10000) => {
        if (window.DatabaseAPI) {
            return true;
        }
        
        // Listen for corebundle:ready event as a signal that DatabaseAPI might be available
        const bundleReadyPromise = new Promise((resolve) => {
            const handler = () => {
                window.removeEventListener('corebundle:ready', handler);
                resolve(window.DatabaseAPI ? true : false);
            };
            window.addEventListener('corebundle:ready', handler, { once: true });
        });
        
        // Also poll for DatabaseAPI
        const pollPromise = new Promise((resolve) => {
            const startTime = Date.now();
            const checkInterval = setInterval(() => {
                if (window.DatabaseAPI) {
                    clearInterval(checkInterval);
                    resolve(true);
                } else if (Date.now() - startTime >= maxWait) {
                    clearInterval(checkInterval);
                    resolve(false);
                }
            }, 100);
        });
        
        // Wait for either the bundle to be ready or DatabaseAPI to appear
        const result = await Promise.race([bundleReadyPromise, pollPromise]);
        
        // If bundle was ready but DatabaseAPI still not available, wait a bit more
        if (!result && window.DatabaseAPI) {
            return true;
        }
        
        return result;
    }, []);

    // Fetch data with cache awareness
    const fetchData = useCallback(async (key, force = false) => {
        // Check if already fetching
        if (fetchingRef.current.has(key)) {
            return cache[key].data;
        }

        // Use cache if valid and not forced
        if (!force && isCacheValid(key)) {
            return cache[key].data;
        }

        // Check authentication
        const token = window.storage?.getToken?.();
        if (!token) {
            return cache[key].data || null;
        }

        // Mark as fetching
        fetchingRef.current.add(key);
        
        // Update loading state
        setCache(prev => ({
            ...prev,
            [key]: { ...prev[key], loading: true, error: null }
        }));
        
        try {
            let response;
            let data;

            // Fetch from appropriate API endpoint
            switch (key) {
                case 'clients':
                    response = await window.api.listClients();
                    data = response?.data?.clients || [];
                    // Filter to only clients (not leads)
                    data = data.filter(c => c.type === 'client');
                    break;
                    
                case 'leads':
                    response = await window.api.getLeads();
                    data = response?.data?.leads || [];
                    break;
                    
                case 'projects':
                    // Wait for DatabaseAPI to be available before fetching projects
                    await waitForDatabaseAPI();
                    if (window.DatabaseAPI?.getProjects) {
                        response = await window.DatabaseAPI.getProjects();
                    } else if (window.api?.getProjects) {
                        response = await window.api.getProjects();
                    } else {
                        throw new Error('Neither DatabaseAPI.getProjects nor api.getProjects is available');
                    }
                    data = response?.data?.projects || response?.projects || response?.data || [];
                    break;
                    
                case 'timeEntries':
                    await waitForDatabaseAPI();
                    if (window.DatabaseAPI?.getTimeEntries) {
                        response = await window.DatabaseAPI.getTimeEntries();
                    } else if (window.api?.getTimeEntries) {
                        response = await window.api.getTimeEntries();
                    } else {
                        throw new Error('Neither DatabaseAPI.getTimeEntries nor api.getTimeEntries is available');
                    }
                    data = response?.data || response || [];
                    break;
                    
                case 'invoices':
                    await waitForDatabaseAPI();
                    if (window.DatabaseAPI?.getInvoices) {
                        response = await window.DatabaseAPI.getInvoices();
                    } else if (window.api?.getInvoices) {
                        response = await window.api.getInvoices();
                    } else {
                        throw new Error('Neither DatabaseAPI.getInvoices nor api.getInvoices is available');
                    }
                    data = response?.data || response || [];
                    break;
                    
                case 'employees':
                case 'users':
                    await waitForDatabaseAPI();
                    if (window.DatabaseAPI?.getUsers) {
                        response = await window.DatabaseAPI.getUsers();
                    } else if (window.api?.getUsers) {
                        response = await window.api.getUsers();
                    } else {
                        throw new Error('Neither DatabaseAPI.getUsers nor api.getUsers is available');
                    }
                    data = response?.data?.users || response?.users || response?.data || [];
                    break;
                    
                case 'dashboard':
                    // Dashboard metrics
                    const [clientsRes, projectsRes, invoicesRes] = await Promise.all([
                        window.api.listClients(),
                        window.api.getProjects(),
                        window.api.getInvoices()
                    ]);
                    data = {
                        clients: clientsRes?.data?.clients || [],
                        projects: projectsRes?.data?.projects || projectsRes?.projects || [],
                        invoices: invoicesRes?.data || []
                    };
                    break;
                    
                default:
                    data = [];
            }

            // Update cache with fresh data
            setCache(prev => ({
                ...prev,
                [key]: {
                    ...prev[key],
                    data,
                    timestamp: Date.now(),
                    loading: false,
                    error: null
                }
            }));

            return data;

        } catch (error) {
            const errorMessage = error?.message || String(error);
            
            // Check if it's a database connection error (expected when DB is down)
            const isDatabaseError = errorMessage.includes('Database connection failed') ||
                                  errorMessage.includes('unreachable') ||
                                  errorMessage.includes('ECONNREFUSED') ||
                                  errorMessage.includes('ETIMEDOUT');
            
            // Only log non-database errors (database errors are expected when DB is down)
            if (!isDatabaseError) {
                console.error(`❌ Error fetching ${key}:`, error);
            }
            
            // Update error state
            setCache(prev => ({
                ...prev,
                [key]: {
                    ...prev[key],
                    loading: false,
                    error: errorMessage
                }
            }));

            // Return cached data if available, even if stale
            return cache[key].data || null;
            
        } finally {
            // Remove from fetching set
            fetchingRef.current.delete(key);
        }
    }, [cache, isCacheValid, waitForDatabaseAPI]);

    // Update cache without refetching (optimistic updates)
    const updateCache = useCallback((key, updater) => {
        setCache(prev => {
            const currentData = prev[key].data;
            
            // For array-type keys, ensure we always have an array to work with
            const arrayKeys = ['clients', 'leads', 'projects', 'timeEntries', 'invoices', 'employees', 'users'];
            const safeCurrentData = arrayKeys.includes(key) 
                ? (Array.isArray(currentData) ? currentData : [])
                : currentData;
            
            const newData = typeof updater === 'function' ? updater(safeCurrentData) : updater;
            
            return {
                ...prev,
                [key]: {
                    ...prev[key],
                    data: newData,
                    timestamp: Date.now() // Reset timestamp on manual update
                }
            };
        });
    }, []);

    // Invalidate cache (force refetch on next access)
    const invalidateCache = useCallback((key) => {
        setCache(prev => ({
            ...prev,
            [key]: {
                ...prev[key],
                timestamp: null
            }
        }));
    }, []);

    // Invalidate all caches
    const invalidateAllCaches = useCallback(() => {
        setCache(prev => {
            const newCache = {};
            Object.keys(prev).forEach(key => {
                newCache[key] = {
                    ...prev[key],
                    timestamp: null
                };
            });
            return newCache;
        });
    }, []);

    // Get data from cache (synchronous)
    const getCachedData = useCallback((key) => {
        return cache[key]?.data || null;
    }, [cache]);

    // Initial data load on mount
    useEffect(() => {
        const initialLoad = async () => {
            setGlobalLoading(true);
            
            try {
                // Check authentication
                const token = window.storage?.getToken?.();
                if (!token) {
                    setInitialLoadComplete(true);
                    setGlobalLoading(false);
                    return;
                }

                // Load essential data in parallel with timeout - ensure we always complete even if DB is down
                const loadPromise = Promise.allSettled([
                    fetchData('clients').catch(err => {
                        const errorMessage = err?.message || String(err);
                        const isDatabaseError = errorMessage.includes('Database connection failed') ||
                                              errorMessage.includes('unreachable');
                        if (!isDatabaseError) {
                            console.error('❌ Error fetching clients:', err);
                        }
                        return null;
                    }),
                    fetchData('leads').catch(err => {
                        const errorMessage = err?.message || String(err);
                        const isDatabaseError = errorMessage.includes('Database connection failed') ||
                                              errorMessage.includes('unreachable');
                        if (!isDatabaseError) {
                            console.error('❌ Error fetching leads:', err);
                        }
                        return null;
                    }),
                    fetchData('projects').catch(err => {
                        const errorMessage = err?.message || String(err);
                        const isDatabaseError = errorMessage.includes('Database connection failed') ||
                                              errorMessage.includes('unreachable');
                        if (!isDatabaseError) {
                            console.error('❌ Error fetching projects:', err);
                        }
                        return null;
                    }),
                    fetchData('users').catch(err => {
                        const errorMessage = err?.message || String(err);
                        const isDatabaseError = errorMessage.includes('Database connection failed') ||
                                              errorMessage.includes('unreachable');
                        if (!isDatabaseError) {
                            console.error('❌ Error fetching users:', err);
                        }
                        return null;
                    }),
                ]);
                
                // Add timeout to ensure we always complete loading (max 10 seconds)
                const timeoutPromise = new Promise(resolve => setTimeout(resolve, 10000));
                
                await Promise.race([loadPromise, timeoutPromise]);
                
            } catch (error) {
                console.error('❌ Initial load error:', error);
            } finally {
                setGlobalLoading(false);
                setInitialLoadComplete(true);
            }
        };

        initialLoad();
    }, []); // Only run once on mount

    // Subscribe to LiveDataSync for real-time updates
    useEffect(() => {
        const subscriberId = 'data-context-sync';
        
        const handleLiveUpdate = (message) => {
            if (message?.type === 'data' && message.dataType && message.data) {
                // Map dataTypes to cache keys
                const keyMap = {
                    'clients': 'clients',
                    'leads': 'leads',
                    'projects': 'projects',
                    'timeEntries': 'timeEntries',
                    'invoices': 'invoices',
                    'users': 'users',
                    'employees': 'users'
                };
                
                const cacheKey = keyMap[message.dataType];
                if (cacheKey) {
                    updateCache(cacheKey, message.data);
                }
            }
        };

        // Subscribe to live updates
        if (window.LiveDataSync?.subscribe) {
            window.LiveDataSync.subscribe(subscriberId, handleLiveUpdate);
        }

        // Cleanup
        return () => {
            if (window.LiveDataSync?.unsubscribe) {
                window.LiveDataSync.unsubscribe(subscriberId);
            }
        };
    }, [updateCache]);

    // Expose debug function
    useEffect(() => {
        window.debugDataContext = () => {
        };
    }, [getCacheStatus, initialLoadComplete, globalLoading]);

    const value = {
        // Data access
        cache,
        getCachedData,
        
        // Data fetching
        fetchData,
        
        // Cache management
        updateCache,
        invalidateCache,
        invalidateAllCaches,
        isCacheValid,
        getCacheStatus,
        
        // State
        globalLoading,
        initialLoadComplete
    };

    return (
        <DataContext.Provider value={value}>
            {children}
        </DataContext.Provider>
    );
};

// Custom hook to use data context
const useData = () => {
    const context = useContext(DataContext);
    if (!context) {
        throw new Error('useData must be used within DataProvider');
    }
    return context;
};

// Make available globally
try {
    window.DataContext = DataContext;
    window.DataProvider = DataProvider;
    window.useData = useData;
    if (window.debug && !window.debug.performanceMode) {
    }
    
    // Verify React is available
    if (!window.React) {
        console.error('❌ React not available when DataContext.jsx executed');
    }
} catch (error) {
    console.error('❌ DataContext.jsx: Error registering component:', error);
}
