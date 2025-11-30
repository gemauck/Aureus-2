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
        if (this.isRunning) {
            const getLog = () => window.debug?.log || (() => {});
            const log = getLog();
            log('⚠️ LiveDataSync.start() called but already running - skipping');
            return;
        }
        
        const getLog = () => window.debug?.log || (() => {});
        const log = getLog();
        log('🔄 Starting live data synchronization...');
        this.isRunning = true;
        this.connectionStatus = 'connecting';
        
        // Initial sync
        this.sync();
        
        // Set up interval
        this.intervalId = setInterval(() => {
            // Double-check isRunning before each interval sync
            if (this.isRunning && !this.isPaused) {
                this.sync();
            }
        }, this.refreshInterval);
        
        // Listen for visibility changes to sync when tab becomes active
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.isRunning && !this.isPaused) {
                log('👁️ Tab became visible, syncing data...');
                this.sync();
            }
        });
        
        // Listen for online/offline events
        window.addEventListener('online', () => {
            if (this.isRunning && !this.isPaused) {
                log('🌐 Network online, syncing data...');
                this.sync();
            }
        });
        
        window.addEventListener('offline', () => {
            log('📴 Network offline');
            this.connectionStatus = 'offline';
            this.notifySubscribers({ type: 'connection', status: 'offline' });
        });
    }

    // Stop the live sync service
    stop() {
        if (!this.isRunning) {
            const getLog = () => window.debug?.log || (() => {});
            const log = getLog();
            log('⏹️ LiveDataSync.stop() called but already stopped');
            return;
        }
        
        const getLog = () => window.debug?.log || (() => {});
        const log = getLog();
        log('⏹️ Stopping live data synchronization...');
        this.isRunning = false;
        this.connectionStatus = 'disconnected';
        
        // Abort any sync in progress IMMEDIATELY
        if (this.syncInProgress) {
            log('⏹️ Aborting sync in progress immediately');
            this.syncInProgress = false;
            this._forceSyncInProgress = false;
        }
        
        // Clear interval timer to prevent any scheduled syncs
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            log('⏹️ Cleared sync interval timer');
        }
        
        // Clear data cache to prevent stale data from being served
        this.dataCache.clear();
        log('⏹️ Cleared data cache');
        
        // Notify subscribers that LiveDataSync is disconnected
        this.notifySubscribers({ type: 'connection', status: 'disconnected' });
        log('⏹️ LiveDataSync stopped completely');
    }

    // Pause syncing (e.g., when modal is open)
    pause() {
        this.pauseCount++;
        this.isPaused = true;
        const getLog = () => window.debug?.log || (() => {});
        const log = getLog();
        log(`⏸️ Pausing live data sync (pause count: ${this.pauseCount})`);
        
        // Clear interval timer to stop scheduled syncs
        if (this.intervalId && this.pauseCount === 1) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            log('⏸️ Cleared sync interval timer');
        }
        
        // If sync is in progress, mark it to abort (results will be skipped)
        if (this.syncInProgress) {
            log('⏸️ Sync in progress - will abort when current operations complete');
        }
        
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
            
            // Restart interval timer if sync service is running
            if (this.isRunning && !this.intervalId) {
                this.intervalId = setInterval(() => {
                    this.sync();
                }, this.refreshInterval);
                log('▶️ Restarted sync interval timer');
            }
            
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
        
        // CRITICAL: Check if LiveDataSync is running - abort if stopped
        // This check happens FIRST before any async operations
        if (!this.isRunning) {
            log('⏹️ Sync aborted - LiveDataSync is stopped (checked at start of sync)');
            return;
        }
        
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

            log('🔄 [LiveDataSync] Syncing live data...');
            
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
                        // Check if stopped or paused before making API call
                        if (!this.isRunning) {
                            log(`⏹️ Sync stopped, skipping ${call.type} API call`);
                            resolve({ dataType: call.type, success: false, skipped: true });
                            return;
                        }
                        if (this.isPaused) {
                            log(`⏸️ Sync paused, skipping ${call.type} API call`);
                            resolve({ dataType: call.type, success: false, skipped: true });
                            return;
                        }
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
                            // Check if stopped or paused before making API call
                            if (!this.isRunning) {
                                log('⏹️ Sync stopped, skipping users API call');
                                resolve({ dataType: 'users', success: false, skipped: true });
                                return;
                            }
                            if (this.isPaused) {
                                log('⏸️ Sync paused, skipping users API call');
                                resolve({ dataType: 'users', success: false, skipped: true });
                                return;
                            }
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
            
            // Check if stopped or paused after async operations complete - abort if stopped/paused
            if (!this.isRunning) {
                log('⏹️ Sync stopped during execution, aborting results processing');
                this.syncInProgress = false;
                this._forceSyncInProgress = false;
                return;
            }
            if (this.isPaused) {
                log('⏸️ Sync paused during execution, aborting results processing');
                this.syncInProgress = false;
                this._forceSyncInProgress = false;
                return;
            }
            
            // Check for failures - handle both rejected promises and failed syncData results
            // Skip results that were skipped due to pause
            const failures = results.filter(result => {
                if (result.status === 'rejected') return true;
                // Check if the result itself indicates failure (but not skipped)
                if (result.status === 'fulfilled' && result.value && !result.value.success && !result.value.skipped) {
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
            
            // Check if it's a server error (5xx)
            const isServerError = errorMessage.includes('502') ||
                                 errorMessage.includes('503') ||
                                 errorMessage.includes('504') ||
                                 errorMessage.includes('500') ||
                                 errorMessage.includes('Bad Gateway') ||
                                 errorMessage.includes('Service Unavailable') ||
                                 errorMessage.toLowerCase().includes('bad gateway');
            
            // Only log non-network/server errors (network/server errors are expected when server/DB is down)
            if (!isNetworkError && !isServerError) {
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
            
            // Stop sync if too many errors (but allow more retries for network/server errors)
            if (this.errorCount >= this.maxErrors * ((isNetworkError || isServerError) ? 2 : 1)) {
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
            // Check if stopped or paused before making any API calls
            if (!this.isRunning) {
                const getLog = () => window.debug?.log || (() => {});
                const log = getLog();
                log(`⏹️ Sync stopped, skipping ${dataType} sync`);
                return { dataType, success: false, skipped: true };
            }
            if (this.isPaused) {
                const getLog = () => window.debug?.log || (() => {});
                const log = getLog();
                log(`⏸️ Sync paused, skipping ${dataType} sync`);
                return { dataType, success: false, skipped: true };
            }
            
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
            
            // Check if it's a server error (5xx) - Bad Gateway, Service Unavailable, etc.
            const isServerError = errorMessage.includes('502') ||
                                 errorMessage.includes('503') ||
                                 errorMessage.includes('504') ||
                                 errorMessage.includes('500') ||
                                 errorMessage.includes('Bad Gateway') ||
                                 errorMessage.includes('Service Unavailable') ||
                                 errorMessage.includes('Gateway Timeout') ||
                                 errorMessage.toLowerCase().includes('bad gateway') ||
                                 errorMessage.toLowerCase().includes('service unavailable');
            
            // Check if it's a rate limit error
            const isRateLimit = errorMessage.includes('Too many requests') || 
                              errorMessage.includes('429') || 
                              errorMessage.includes('rate limit') ||
                              errorMessage.toLowerCase().includes('too many requests');
            
            if (isRateLimit) {
                log(`🚫 Rate limit error syncing ${dataType} - API is throttling requests`);
            } else if (isNetworkError || isServerError) {
                log(`⚠️ Network/server error syncing ${dataType} - API may be unavailable`);
            } else {
                // Only log non-network/server errors to console (network/server errors are expected)
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
        // Don't notify subscribers of data or sync updates if LiveDataSync is stopped
        // Connection status changes (like 'disconnected', 'paused') should still be sent
        // to inform subscribers that LiveDataSync was stopped
        if (!this.isRunning) {
            // Only allow connection status messages when stopped (to notify about the stop)
            if (message?.type === 'connection' && message?.status === 'disconnected') {
                // Allow disconnected status to notify subscribers
            } else if (message?.type === 'data' || message?.type === 'sync') {
                const getLog = () => window.debug?.log || (() => {});
                const log = getLog();
                log(`⏹️ Skipping ${message?.type} notification - LiveDataSync is stopped`);
                return;
            }
        }
        
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
        
        // Respect pause state - don't force sync if paused
        if (this.isPaused) {
            log('⏸️ Force sync skipped - LiveDataSync is paused');
            return;
        }
        
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
    window.storage?.removeToken?.();
    // Clear any stale user data as well
    if (window.storage?.removeUser) {
        window.storage.removeUser();
    }
}

// Debug function
window.debugLiveSync = () => {
};
