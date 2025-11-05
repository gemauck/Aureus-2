// Real-time Data Synchronization Service
class LiveDataSync {
    constructor() {
        this.subscribers = new Map();
        this.refreshInterval = 15000; // 15 seconds - reduced frequency to prevent rate limiting
        this.isRunning = false;
        this.lastSync = null;
        this.syncInProgress = false;
        this.connectionStatus = 'disconnected';
        this.errorCount = 0;
        this.maxErrors = 3;
        this.rateLimitBackoff = 0; // Backoff delay in milliseconds when rate limited
        this.isPaused = false; // Pause state to prevent syncing when modals are open
        this.pauseCount = 0; // Track number of pause requests (for nested pauses)
        
        // Cache for each data type
        this.dataCache = new Map();
        
        // Bind methods
        this.start = this.start.bind(this);
        this.stop = this.stop.bind(this);
        this.sync = this.sync.bind(this);
        this.subscribe = this.subscribe.bind(this);
        this.unsubscribe = this.unsubscribe.bind(this);
        this.notifySubscribers = this.notifySubscribers.bind(this);
        this.pause = this.pause.bind(this);
        this.resume = this.resume.bind(this);
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

    // Pause syncing (e.g., when modal is open)
    pause() {
        this.pauseCount++;
        this.isPaused = true;
        const getLog = () => window.debug?.log || (() => {});
        const log = getLog();
        log(`⏸️ Pausing live data sync (pause count: ${this.pauseCount})`);
        this.notifySubscribers({ type: 'connection', status: 'paused' });
    }

    // Resume syncing (e.g., when modal is closed)
    resume() {
        if (this.pauseCount > 0) {
            this.pauseCount--;
        }
        if (this.pauseCount === 0) {
            this.isPaused = false;
            const getLog = () => window.debug?.log || (() => {});
            const log = getLog();
            log('▶️ Resuming live data sync');
            this.notifySubscribers({ 
                type: 'connection', 
                status: this.isRunning ? 'connected' : 'disconnected' 
            });
            // Trigger immediate sync when resuming if running
            if (this.isRunning) {
                this.sync();
            }
        } else {
            const getLog = () => window.debug?.log || (() => {});
            const log = getLog();
            log(`⏸️ Live data sync still paused (pause count: ${this.pauseCount})`);
        }
    }

    // Perform data synchronization
    async sync() {
        // Define log function at the top and ensure it's always available
        const getLog = () => window.debug?.log || (() => {});
        const log = getLog();
        
        // Check if paused - skip sync if paused
        if (this.isPaused) {
            log('⏸️ Sync paused, skipping...');
            return;
        }
        
        if (this.syncInProgress) {
            log('⏳ Sync already in progress, skipping...');
            return;
        }
        
        // Additional check to prevent rapid sync calls (skip if force sync)
        if (!this._forceSyncInProgress) {
            const now = Date.now();
            const minInterval = 3000 + this.rateLimitBackoff; // 3 seconds minimum + backoff
            if (this.lastSync && (now - this.lastSync.getTime()) < minInterval) {
                log(`⏳ Sync too recent (${Math.round((now - this.lastSync.getTime()) / 1000)}s ago), skipping...`);
                return;
            }
        }
        
        // Check if we're in rate limit backoff period
        if (this.rateLimitBackoff > 0) {
            const now = Date.now();
            const backoffEnd = this._rateLimitBackoffEnd || 0;
            if (now < backoffEnd) {
                const remainingSeconds = Math.ceil((backoffEnd - now) / 1000);
                log(`⏳ Rate limit backoff active, waiting ${remainingSeconds}s more...`);
                return;
            }
            // Backoff period ended, reset
            this.rateLimitBackoff = 0;
            this._rateLimitBackoffEnd = null;
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
            
            // Sync core data types - stagger calls to prevent rate limiting
            // Check if this is a forced sync (bypassCache parameter)
            const bypassCache = this._forceSyncInProgress || false;
            
            // Stagger API calls to prevent hitting rate limits
            // Start with most important data types first
            const syncPromises = [];
            const syncCalls = [
                { type: 'clients', fn: () => window.DatabaseAPI.getClients() },
                { type: 'leads', fn: () => window.DatabaseAPI.getLeads() },
                { type: 'projects', fn: () => window.DatabaseAPI.getProjects() },
                { type: 'invoices', fn: () => window.DatabaseAPI.getInvoices() },
                { type: 'timeEntries', fn: () => window.DatabaseAPI.getTimeEntries() }
            ];
            
            // Execute calls with delays between them
            for (let i = 0; i < syncCalls.length; i++) {
                const call = syncCalls[i];
                const delay = i * 200; // 200ms delay between each call
                const promise = new Promise(resolve => {
                    setTimeout(async () => {
                        try {
                            const result = await this.syncData(call.type, call.fn, bypassCache);
                            resolve(result);
                        } catch (error) {
                            resolve({ dataType: call.type, success: false });
                        }
                    }, delay);
                });
                syncPromises.push(promise);
            }

            // Only sync users if admin to avoid unnecessary 401s and extra load
            try {
                const role = window.storage?.getUser?.()?.role?.toLowerCase?.();
                if (role === 'admin') {
                    // Add users sync with delay after other calls
                    const usersDelay = syncCalls.length * 200; // After all other calls
                    const usersPromise = new Promise(resolve => {
                        setTimeout(async () => {
                            try {
                                const result = await this.syncData('users', () => window.DatabaseAPI.getUsers(), bypassCache);
                                resolve(result);
                            } catch (error) {
                                resolve({ dataType: 'users', success: false });
                            }
                        }, usersDelay);
                    });
                    syncPromises.push(usersPromise);
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
            
            // Check for rate limiting errors
            const rateLimitErrors = results.filter(result => {
                if (result.status === 'fulfilled' && result.value && result.value.error) {
                    const errorMsg = result.value.error.toLowerCase();
                    return errorMsg.includes('too many requests') || errorMsg.includes('429') || errorMsg.includes('rate limit');
                }
                return false;
            });
            
            const successful = results.length - failures.length;
            
            // If we hit rate limits, increase backoff exponentially
            if (rateLimitErrors.length > 0) {
                this.rateLimitBackoff = Math.min(this.rateLimitBackoff * 2 || 10000, 60000); // Max 60 seconds
                this._rateLimitBackoffEnd = Date.now() + this.rateLimitBackoff;
                log(`🚫 Rate limit detected, backing off for ${Math.round(this.rateLimitBackoff / 1000)}s`);
                // Increase refresh interval temporarily
                const originalInterval = this.refreshInterval;
                this.refreshInterval = Math.min(originalInterval * 2, 60000); // Max 60 seconds
                // Reset interval after backoff period
                setTimeout(() => {
                    this.refreshInterval = originalInterval;
                }, this.rateLimitBackoff);
            } else if (failures.length > 0) {
                if (successful > 0) {
                    log(`⚠️ ${failures.length} sync operations failed, ${successful} succeeded`);
                } else {
                    log(`⚠️ All ${failures.length} sync operations failed - API may be unavailable`);
                }
                this.errorCount++;
            } else {
                this.errorCount = 0; // Reset error count on success
                // Reset backoff on success
                if (this.rateLimitBackoff > 0) {
                    this.rateLimitBackoff = 0;
                    this._rateLimitBackoffEnd = null;
                }
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
            const now = Date.now(); // Get timestamp once for use throughout the function
            // Check if we recently synced this data type (unless bypassing cache)
            if (!bypassCache) {
                const cacheEntry = this.dataCache.get(dataType);
                const CACHE_DURATION = 15000; // 15 seconds per data type - longer cache to reduce API calls
                
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
            
            // Check if it's a rate limit error
            const isRateLimit = errorMessage.includes('Too many requests') || 
                              errorMessage.includes('429') || 
                              errorMessage.includes('rate limit') ||
                              errorMessage.toLowerCase().includes('too many requests');
            
            if (isRateLimit) {
                log(`🚫 Rate limit error syncing ${dataType} - API is throttling requests`);
            } else if (isNetworkError) {
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
                cached: false,
                isRateLimit
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
            syncInProgress: this.syncInProgress,
            isPaused: this.isPaused,
            pauseCount: this.pauseCount
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
