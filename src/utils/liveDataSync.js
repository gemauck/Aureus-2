// Real-time Data Synchronization Service
class LiveDataSync {
    constructor() {
        this.subscribers = new Map();
        this.refreshInterval = 30000; // 30 seconds
        this.isRunning = false;
        this.lastSync = null;
        this.syncInProgress = false;
        this.connectionStatus = 'disconnected';
        this.errorCount = 0;
        this.maxErrors = 3;
        
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
        
        console.log('🔄 Starting live data synchronization...');
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
                console.log('👁️ Tab became visible, syncing data...');
                this.sync();
            }
        });
        
        // Listen for online/offline events
        window.addEventListener('online', () => {
            console.log('🌐 Network online, syncing data...');
            this.sync();
        });
        
        window.addEventListener('offline', () => {
            console.log('📴 Network offline');
            this.connectionStatus = 'offline';
            this.notifySubscribers({ type: 'connection', status: 'offline' });
        });
    }

    // Stop the live sync service
    stop() {
        if (!this.isRunning) return;
        
        console.log('⏹️ Stopping live data synchronization...');
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
        if (this.syncInProgress) {
            console.log('⏳ Sync already in progress, skipping...');
            return;
        }
        
        this.syncInProgress = true;
        this.connectionStatus = 'syncing';
        
        try {
            // Check authentication
            const token = window.storage?.getToken?.();
            if (!token) {
                console.log('⚠️ No authentication token, skipping sync');
                this.connectionStatus = 'disconnected';
                this.notifySubscribers({ type: 'connection', status: 'disconnected' });
                return;
            }

            // Check if DatabaseAPI is available
            if (!window.DatabaseAPI) {
                throw new Error('Database API not available');
            }

            console.log('🔄 Syncing live data...');
            
            // Sync all data types
            const syncPromises = [
                this.syncData('clients', () => window.DatabaseAPI.getClients()),
                this.syncData('leads', () => window.DatabaseAPI.getLeads()),
                this.syncData('projects', () => window.DatabaseAPI.getProjects()),
                this.syncData('invoices', () => window.DatabaseAPI.getInvoices()),
                this.syncData('timeEntries', () => window.DatabaseAPI.getTimeEntries()),
                this.syncData('users', () => window.DatabaseAPI.getUsers())
            ];

            const results = await Promise.allSettled(syncPromises);
            
            // Check for any failures
            const failures = results.filter(result => result.status === 'rejected');
            if (failures.length > 0) {
                console.warn(`⚠️ ${failures.length} sync operations failed:`, failures);
                this.errorCount++;
            } else {
                this.errorCount = 0; // Reset error count on success
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
            
            console.log('✅ Live data sync completed successfully');

        } catch (error) {
            console.error('❌ Live data sync failed:', error);
            this.connectionStatus = 'error';
            this.errorCount++;
            
            // Notify subscribers of sync failure
            this.notifySubscribers({ 
                type: 'sync', 
                status: 'error', 
                error: error.message,
                errorCount: this.errorCount
            });
            
            // Stop sync if too many errors
            if (this.errorCount >= this.maxErrors) {
                console.error('🛑 Too many sync errors, stopping live sync');
                this.stop();
            }
        } finally {
            this.syncInProgress = false;
        }
    }

    // Sync individual data type
    async syncData(dataType, fetchFunction) {
        try {
            const response = await fetchFunction();
            const data = response.data || response;
            
            // Notify subscribers of data update
            this.notifySubscribers({ 
                type: 'data', 
                dataType, 
                data,
                timestamp: new Date()
            });
            
            return { dataType, data, success: true };
        } catch (error) {
            console.error(`❌ Failed to sync ${dataType}:`, error);
            throw error;
        }
    }

    // Subscribe to live updates
    subscribe(id, callback) {
        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }
        
        this.subscribers.set(id, callback);
        console.log(`📡 Subscribed to live updates: ${id}`);
        
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
        console.log(`📡 Unsubscribed from live updates: ${id}`);
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

    // Force immediate sync
    async forceSync() {
        console.log('🔄 Force sync requested...');
        await this.sync();
    }
}

// Create global instance
window.LiveDataSync = new LiveDataSync();

// Auto-start if token exists and user data is available
if (window.storage?.getToken?.() && window.storage?.getUser?.()) {
    console.log('🚀 Auto-starting live data sync...');
    window.LiveDataSync.start();
} else if (window.storage?.getToken?.() && !window.storage?.getUser?.()) {
    console.log('⚠️ Token exists but no user data, clearing token');
    window.storage?.removeToken?.();
}

// Debug function
window.debugLiveSync = () => {
    console.log('🔍 Live Data Sync Debug:', window.LiveDataSync.getStatus());
};
