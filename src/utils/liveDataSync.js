// Real-time Data Synchronization Service
class LiveDataSync {
    constructor() {
        this.subscribers = new Map();
        this.refreshInterval = 5000; // 5 seconds - very frequent sync for real-time updates
        this.isRunning = false;
        this.lastSync = null;
        this.syncInProgress = false;
        this.connectionStatus = 'disconnected';
        this.errorCount = 0;
        this.maxErrors = 3;
        
        // Cache for each data type
        this.dataCache = new Map();
        
        // Bind methods
        this.start = this.start.bind(this);
        this.stop = this.stop.bind(this);
        this.sync = this.sync.bind(this);
        this.subscribe = this.subscribe.bind(this);
        this.unsubscribe = this.unsubscribe.bind(this);
        this.notifySubscribers = this.notifySubscribers.bind(this);
    }

    // Start the live sync service
    start() {
        if (this.isRunning) return;
        
        const getLog = () => window.debug?.log || (() => {});
        const log = getLog();
        log('🔄 Starting live data synchronization...');
        this.isRunning = true;
        this.connectionStatus = 'connecting';
        
        // Initial sync
        this.sync();
        
        // Set up interval
        this.intervalId = setInterval(() => {
            this.sync();
        }, this.refreshInterval);
        
        // Listen for visibility changes to sync when tab becomes active
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.isRunning) {
                log('👁️ Tab became visible, syncing data...');
                this.sync();
            }
        });
        
        // Listen for online/offline events
        window.addEventListener('online', () => {
            log('🌐 Network online, syncing data...');
            this.sync();
        });
        
        window.addEventListener('offline', () => {
            log('📴 Network offline');
            this.connectionStatus = 'offline';
            this.notifySubscribers({ type: 'connection', status: 'offline' });
        });
    }

    // Stop the live sync service
    stop() {
        if (!this.isRunning) return;
        
        const getLog = () => window.debug?.log || (() => {});
        const log = getLog();
        log('⏹️ Stopping live data synchronization...');
        this.isRunning = false;
        this.connectionStatus = 'disconnected';
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        
        this.notifySubscribers({ type: 'connection', status: 'disconnected' });
    }

    // Perform data synchronization
    async sync() {
        // Define log function at the top and ensure it's always available
        const getLog = () => window.debug?.log || (() => {});
        const log = getLog();
        
        if (this.syncInProgress) {
            log('⏳ Sync already in progress, skipping...');
            return;
        }
        
        // Additional check to prevent rapid sync calls (skip if force sync)
        if (!this._forceSyncInProgress) {
            const now = Date.now();
            if (this.lastSync && (now - this.lastSync.getTime()) < 2000) { // 2 seconds minimum to prevent excessive calls
                log(`⏳ Sync too recent (${Math.round((now - this.lastSync.getTime()) / 1000)}s ago), skipping...`);
                return;
            }
        }
        
        this.syncInProgress = true;
        this.connectionStatus = 'syncing';
        
        try {
            // Check authentication
            const token = window.storage?.getToken?.();
            if (!token) {
                log('⚠️ No authentication token, skipping sync');
                this.connectionStatus = 'disconnected';
                this.notifySubscribers({ type: 'connection', status: 'disconnected' });
                return;
            }

            // Check if DatabaseAPI is available
            if (!window.DatabaseAPI) {
                throw new Error('Database API not available');
            }

            log('🔄 Syncing live data...');
            
            // Sync core data types - ensure promises never reject by catching all errors
            // syncData handles errors internally, but add extra safety layer
            // Check if this is a forced sync (bypassCache parameter)
            const bypassCache = this._forceSyncInProgress || false;
            const syncPromises = [
                this.syncData('clients', () => window.DatabaseAPI.getClients(), bypassCache).catch(() => ({ dataType: 'clients', success: false })),
                this.syncData('leads', () => window.DatabaseAPI.getLeads(), bypassCache).catch(() => ({ dataType: 'leads', success: false })),
                this.syncData('projects', () => window.DatabaseAPI.getProjects(), bypassCache).catch(() => ({ dataType: 'projects', success: false })),
                this.syncData('invoices', () => window.DatabaseAPI.getInvoices(), bypassCache).catch(() => ({ dataType: 'invoices', success: false })),
                this.syncData('timeEntries', () => window.DatabaseAPI.getTimeEntries(), bypassCache).catch(() => ({ dataType: 'timeEntries', success: false }))
            ];

            // Only sync users if admin to avoid unnecessary 401s and extra load
            try {
                const role = window.storage?.getUser?.()?.role?.toLowerCase?.();
                if (role === 'admin') {
                    syncPromises.push(this.syncData('users', () => window.DatabaseAPI.getUsers(), bypassCache).catch(() => ({ dataType: 'users', success: false })));
                }
            } catch (_) {
                // Ignore role check errors
            }

            const results = await Promise.allSettled(syncPromises);
            
            // Check for failures - handle both rejected promises and failed syncData results
            const failures = results.filter(result => {
                if (result.status === 'rejected') return true;
                // Check if the result itself indicates failure
                if (result.status === 'fulfilled' && result.value && !result.value.success) {
                    return true;
                }
                return false;
            });
            
            const successful = results.length - failures.length;
            
            if (failures.length > 0) {
                if (successful > 0) {
                    log(`⚠️ ${failures.length} sync operations failed, ${successful} succeeded`);
                } else {
                    log(`⚠️ All ${failures.length} sync operations failed - API may be unavailable`);
                }
                this.errorCount++;
            } else {
                this.errorCount = 0; // Reset error count on success
                log(`✅ All ${successful} sync operations succeeded`);
            }

            this.connectionStatus = 'connected';
            this.lastSync = new Date();
            
            // Notify subscribers of successful sync
            this.notifySubscribers({ 
                type: 'sync', 
                status: 'success', 
                timestamp: this.lastSync,
                errorCount: failures.length
            });
            
            log('✅ Live data sync completed successfully');

        } catch (error) {
            const errorMessage = error.message || String(error);
            const isNetworkError = errorMessage.includes('Failed to fetch') || 
                                 errorMessage.includes('NetworkError') ||
                                 errorMessage.includes('Database connection failed') ||
                                 errorMessage.includes('unreachable');
            
            // Only log non-network errors (network errors are expected when DB is down)
            if (!isNetworkError) {
                console.error('❌ Live data sync failed:', error);
            }
            
            this.connectionStatus = 'error';
            this.errorCount++;
            
            // Notify subscribers of sync failure
            this.notifySubscribers({ 
                type: 'sync', 
                status: 'error', 
                error: errorMessage,
                errorCount: this.errorCount
            });
            
            // Stop sync if too many errors (but allow more retries for network errors)
            if (this.errorCount >= this.maxErrors * (isNetworkError ? 2 : 1)) {
                console.error('🛑 Too many sync errors, stopping live sync');
                this.stop();
            }
        } finally {
            this.syncInProgress = false;
            this._forceSyncInProgress = false; // Reset force sync flag
        }
    }

    // Sync individual data type with caching
    async syncData(dataType, fetchFunction, bypassCache = false) {
        // Wrap entire function to ensure it never throws
        try {
            // Check if we recently synced this data type (unless bypassing cache)
            if (!bypassCache) {
                const cacheEntry = this.dataCache.get(dataType);
                const now = Date.now();
                const CACHE_DURATION = 5000; // 5 seconds per data type - shorter cache for faster updates
                
                if (cacheEntry && (now - cacheEntry.timestamp) < CACHE_DURATION) {
                    const getLog = () => window.debug?.log || (() => {});
                    const log = getLog();
                    log(`⚡ Using cached ${dataType} (${Math.round((now - cacheEntry.timestamp) / 1000)}s old)`);
                    // Send cached data to subscribers
                    this.notifySubscribers({ 
                        type: 'data', 
                        dataType, 
                        data: cacheEntry.data,
                        timestamp: cacheEntry.timestamp
                    });
                    return { dataType, data: cacheEntry.data, success: true, cached: true };
                }
            }
            
            // Call fetchFunction - errors will be caught by outer try-catch
            const response = await fetchFunction();
            
            // Extract the array from the response structure
            // API returns { data: { clients: [...] } } or { data: { leads: [...] } } etc.
            let data = null;
            if (response?.data && typeof response.data === 'object') {
                // Try to extract array from nested structure using dataType
                const arrayKey = dataType === 'clients' ? 'clients' : 
                               dataType === 'leads' ? 'leads' : 
                               dataType === 'projects' ? 'projects' : 
                               dataType === 'invoices' ? 'invoices' : 
                               dataType === 'timeEntries' ? 'timeEntries' : 
                               dataType === 'users' ? 'users' : 
                               null;
                
                if (arrayKey && Array.isArray(response.data[arrayKey])) {
                    data = response.data[arrayKey];
                } else if (Array.isArray(response.data)) {
                    // Sometimes response.data is already an array (like projects, invoices)
                    data = response.data;
                } else if (response.data) {
                    // Fallback: use response.data as-is
                    data = response.data;
                }
            } else if (Array.isArray(response)) {
                data = response;
            } else {
                data = response;
            }
            
            // Cache the data
            this.dataCache.set(dataType, {
                data,
                timestamp: now
            });
            
            // Notify subscribers of data update
            this.notifySubscribers({ 
                type: 'data', 
                dataType, 
                data,
                timestamp: new Date()
            });
            
            return { dataType, data, success: true, cached: false };
        } catch (error) {
            // Don't throw errors for network failures - just log and return failure
            // This allows the app to continue working even if API is temporarily unavailable
            const getLog = () => window.debug?.log || (() => {});
            const log = getLog();
            const errorMessage = error.message || String(error);
            
            // Check if it's a network or database connection error
            const isNetworkError = errorMessage.includes('Failed to fetch') || 
                                 errorMessage.includes('NetworkError') ||
                                 errorMessage.includes('Database connection failed') ||
                                 errorMessage.includes('unreachable') ||
                                 errorMessage.includes('ECONNREFUSED') ||
                                 errorMessage.includes('ETIMEDOUT');
            
            if (isNetworkError) {
                log(`⚠️ Network/database error syncing ${dataType} - API may be unavailable`);
            } else {
                // Only log non-network errors to console (network errors are expected)
                console.error(`❌ Failed to sync ${dataType}:`, error);
            }
            
            // Return failure instead of throwing - allows other syncs to continue
            return { 
                dataType, 
                success: false, 
                error: errorMessage,
                cached: false
            };
        }
    }

    // Subscribe to live updates
    subscribe(id, callback) {
        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }
        
        this.subscribers.set(id, callback);
        const getLog = () => window.debug?.log || (() => {});
        const log = getLog();
        log(`📡 Subscribed to live updates: ${id}`);
        
        // Send current status to new subscriber
        callback({
            type: 'connection',
            status: this.connectionStatus,
            lastSync: this.lastSync,
            isRunning: this.isRunning
        });
    }

    // Unsubscribe from live updates
    unsubscribe(id) {
        const removed = this.subscribers.delete(id);
        const getLog = () => window.debug?.log || (() => {});
        const log = getLog();
        log(`📡 Unsubscribed from live updates: ${id}`);
        return removed;
    }

    // Notify all subscribers
    notifySubscribers(message) {
        this.subscribers.forEach((callback, id) => {
            try {
                callback(message);
            } catch (error) {
                console.error(`❌ Error notifying subscriber ${id}:`, error);
            }
        });
    }

    // Get current status
    getStatus() {
        return {
            isRunning: this.isRunning,
            connectionStatus: this.connectionStatus,
            lastSync: this.lastSync,
            errorCount: this.errorCount,
            subscriberCount: this.subscribers.size,
            syncInProgress: this.syncInProgress
        };
    }

    // Update refresh interval
    setRefreshInterval(interval) {
        this.refreshInterval = interval;
        
        if (this.isRunning) {
            this.stop();
            this.start();
        }
    }

    // Force immediate sync (bypasses cache)
    async forceSync() {
        const getLog = () => window.debug?.log || (() => {});
        const log = getLog();
        log('🔄 Force sync requested (bypassing cache)...');
        
        // Clear cache for leads and clients to ensure fresh data
        this.dataCache.delete('leads');
        this.dataCache.delete('clients');
        
        // Also clear ClientCache if it exists
        if (window.ClientCache?.clearCache) {
            window.ClientCache.clearCache();
            log('🗑️ Cleared ClientCache for fresh data');
        }
        
        // Clear DatabaseAPI cache for leads and clients
        if (window.DatabaseAPI?.clearCache) {
            window.DatabaseAPI.clearCache('/leads');
            window.DatabaseAPI.clearCache('/clients');
            log('🗑️ Cleared DatabaseAPI cache for leads and clients');
        }
        
        // Clear dataManager cache if it exists
        if (window.dataManager?.invalidate) {
            window.dataManager.invalidate('leads');
            window.dataManager.invalidate('clients');
            log('🗑️ Invalidated dataManager cache');
        }
        
        // If sync is already in progress, wait for it to complete (with timeout)
        if (this.syncInProgress) {
            log('⏳ Sync already in progress, waiting for completion...');
            let waitCount = 0;
            const maxWait = 50; // Wait up to 5 seconds (50 * 100ms)
            while (this.syncInProgress && waitCount < maxWait) {
                await new Promise(resolve => setTimeout(resolve, 100));
                waitCount++;
            }
            if (this.syncInProgress) {
                log('⚠️ Sync still in progress after timeout, proceeding anyway...');
            }
        }
        
        // Set flag to bypass cache during sync
        this._forceSyncInProgress = true;
        await this.sync();
    }
}

// Create global instance
window.LiveDataSync = new LiveDataSync();

// Auto-start if token exists and user data is available
if (window.storage?.getToken?.() && window.storage?.getUser?.()) {
    const getAutoStartLog = () => window.debug?.log || (() => {});
    const autoStartLog = getAutoStartLog();
    autoStartLog('🚀 Auto-starting live data sync...');
    window.LiveDataSync.start();
} else if (window.storage?.getToken?.() && !window.storage?.getUser?.()) {
    console.log('⚠️ Token exists but no user data, clearing orphaned token');
    window.storage?.removeToken?.();
    // Clear any stale user data as well
    if (window.storage?.removeUser) {
        window.storage.removeUser();
    }
}

// Debug function
window.debugLiveSync = () => {
    console.log('🔍 Live Data Sync Debug:', window.LiveDataSync.getStatus());
};
