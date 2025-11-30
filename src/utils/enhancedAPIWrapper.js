// Enhanced API Wrapper with Bulletproof Data Synchronization
class EnhancedAPIWrapper {
    constructor() {
        this.stateManager = window.EnhancedStateManager;
        this.retryConfig = {
            maxRetries: 3,
            baseDelay: 1000,
            maxDelay: 10000,
            backoffMultiplier: 2
        };
        this.requestQueue = [];
        this.isProcessingQueue = false;
        this.connectionStatus = 'online';
        this.pendingRequests = new Map();
        this.requestTimeouts = new Map();
        
        // Bind methods
        this.request = this.request.bind(this);
        this.get = this.get.bind(this);
        this.post = this.post.bind(this);
        this.patch = this.patch.bind(this);
        this.put = this.put.bind(this);
        this.delete = this.delete.bind(this);
        this.processQueue = this.processQueue.bind(this);
        this.retryRequest = this.retryRequest.bind(this);
        this.handleOfflineMode = this.handleOfflineMode.bind(this);
        this.handleOnlineMode = this.handleOnlineMode.bind(this);
        
        // Set up connection monitoring
        this.setupConnectionMonitoring();
    }

    // Set up connection monitoring
    setupConnectionMonitoring() {
        window.addEventListener('online', this.handleOnlineMode);
        window.addEventListener('offline', this.handleOfflineMode);
        
        // Periodic connection check
        setInterval(() => {
            this.checkConnection();
        }, 30000); // Check every 30 seconds
    }

    // Handle online mode
    handleOnlineMode() {
        this.connectionStatus = 'online';
        this.processQueue();
    }

    // Handle offline mode
    handleOfflineMode() {
        this.connectionStatus = 'offline';
    }

    // Check connection status
    async checkConnection() {
        try {
            const response = await fetch('/api/health', { 
                method: 'HEAD',
                cache: 'no-cache'
            });
            this.connectionStatus = response.ok ? 'online' : 'offline';
        } catch (error) {
            this.connectionStatus = 'offline';
        }
    }

    // Enhanced request method with retry logic and offline handling
    async request(endpoint, options = {}) {
        const requestId = this.generateRequestId();
        const {
            method = 'GET',
            data = null,
            retry = true,
            timeout = 30000,
            priority = 'normal'
        } = options;

        const requestConfig = {
            id: requestId,
            endpoint,
            method,
            data,
            retry,
            timeout,
            priority,
            timestamp: Date.now(),
            retryCount: 0
        };

        // If offline, queue the request
        if (this.connectionStatus === 'offline') {
            this.requestQueue.push(requestConfig);
            return this.createOfflineResponse(requestConfig);
        }

        return this.executeRequest(requestConfig);
    }

    // Execute request with retry logic
    async executeRequest(requestConfig) {
        const { id, endpoint, method, data, timeout } = requestConfig;
        
        try {
            // Set up timeout
            const timeoutPromise = new Promise((_, reject) => {
                const timeoutId = setTimeout(() => {
                    reject(new Error(`Request timeout after ${timeout}ms`));
                }, timeout);
                this.requestTimeouts.set(id, timeoutId);
            });

            // Prepare request
            const url = `${window.DatabaseAPI.API_BASE}/api${endpoint}`;
            const token = window.storage?.getToken?.();
            
            if (!token) {
                throw new Error('No authentication token available');
            }

            const requestOptions = {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'X-Request-ID': id
                },
                credentials: 'include'
            };

            if (data && method !== 'GET') {
                requestOptions.body = JSON.stringify(data);
            }

            const execute = async () => Promise.race([
                fetch(url, requestOptions),
                timeoutPromise
            ]);

            // Execute request with timeout
            let response = await execute();

            // Clear timeout
            const timeoutId = this.requestTimeouts.get(id);
            if (timeoutId) {
                clearTimeout(timeoutId);
                this.requestTimeouts.delete(id);
            }

            // Handle response with refresh-once logic
            if (!response.ok && response.status === 401) {
                try {
                    const refreshUrl = `${window.DatabaseAPI.API_BASE}/api/auth/refresh`;
                    const refreshRes = await fetch(refreshUrl, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
                    if (refreshRes.ok) {
                        const text = await refreshRes.text();
                        const refreshData = text ? JSON.parse(text) : {};
                        const newToken = refreshData?.data?.accessToken || refreshData?.accessToken;
                        if (newToken && window.storage?.setToken) {
                            window.storage.setToken(newToken);
                            requestOptions.headers = { ...requestOptions.headers, Authorization: `Bearer ${newToken}` };
                            response = await execute();
                        }
                    }
                } catch (_) {
                    // ignore, will handle below
                }
            }

            if (!response.ok) {
                if (response.status === 401) {
                    // Any unauthorized after optional refresh -> force logout and redirect
                    if (window.forceLogout) {
                        window.forceLogout('SESSION_EXPIRED');
                    } else {
                        if (window.storage?.removeToken) window.storage.removeToken();
                        if (window.storage?.removeUser) window.storage.removeUser();
                        if (window.LiveDataSync) {
                            window.LiveDataSync.stop();
                        }
                        if (!window.location.hash.includes('#/login')) {
                            window.location.hash = '#/login';
                        }
                    }
                    throw new Error('Authentication expired or unauthorized');
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            // Parse response
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                throw new Error(`Non-JSON response: ${text.substring(0, 100)}`);
            }

            const result = await response.json();
            
            // Remove from pending requests
            this.pendingRequests.delete(id);
            
            return result;

        } catch (error) {
            console.error(`❌ ${method} ${endpoint} failed:`, error.message);
            
            // Clear timeout
            const timeoutId = this.requestTimeouts.get(id);
            if (timeoutId) {
                clearTimeout(timeoutId);
                this.requestTimeouts.delete(id);
            }

            // Handle retry logic
            if (requestConfig.retry && requestConfig.retryCount < this.retryConfig.maxRetries) {
                return this.retryRequest(requestConfig, error);
            }

            // Remove from pending requests
            this.pendingRequests.delete(id);
            
            throw error;
        }
    }

    // Retry request with exponential backoff
    async retryRequest(requestConfig, error) {
        requestConfig.retryCount++;
        
        const delay = Math.min(
            this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, requestConfig.retryCount - 1),
            this.retryConfig.maxDelay
        );


        await new Promise(resolve => setTimeout(resolve, delay));
        
        return this.executeRequest(requestConfig);
    }

    // Create offline response
    createOfflineResponse(requestConfig) {
        return new Promise((resolve) => {
            const offlineResponse = {
                offline: true,
                queued: true,
                requestId: requestConfig.id,
                message: 'Request queued for when connection is restored',
                timestamp: new Date().toISOString()
            };
            
            resolve(offlineResponse);
        });
    }

    // Process request queue
    async processQueue() {
        if (this.isProcessingQueue || this.requestQueue.length === 0) {
            return;
        }

        this.isProcessingQueue = true;

        try {
            // Sort by priority and timestamp
            this.requestQueue.sort((a, b) => {
                const priorityOrder = { high: 3, normal: 2, low: 1 };
                const aPriority = priorityOrder[a.priority] || 2;
                const bPriority = priorityOrder[b.priority] || 2;
                
                if (aPriority !== bPriority) {
                    return bPriority - aPriority;
                }
                
                return a.timestamp - b.timestamp;
            });

            // Process requests in batches
            const batchSize = 5;
            const batches = [];
            
            for (let i = 0; i < this.requestQueue.length; i += batchSize) {
                batches.push(this.requestQueue.slice(i, i + batchSize));
            }

            for (const batch of batches) {
                const promises = batch.map(requestConfig => 
                    this.executeRequest(requestConfig).catch(error => {
                        console.error(`Failed to process queued request:`, error);
                        return { error: error.message };
                    })
                );

                await Promise.all(promises);
                
                // Remove processed requests
                batch.forEach(requestConfig => {
                    const index = this.requestQueue.findIndex(r => r.id === requestConfig.id);
                    if (index !== -1) {
                        this.requestQueue.splice(index, 1);
                    }
                });
            }

        } finally {
            this.isProcessingQueue = false;
        }
    }

    // HTTP method wrappers
    async get(endpoint, options = {}) {
        return this.request(endpoint, { ...options, method: 'GET' });
    }

    async post(endpoint, data, options = {}) {
        return this.request(endpoint, { ...options, method: 'POST', data });
    }

    async patch(endpoint, data, options = {}) {
        return this.request(endpoint, { ...options, method: 'PATCH', data });
    }

    async put(endpoint, data, options = {}) {
        return this.request(endpoint, { ...options, method: 'PUT', data });
    }

    async delete(endpoint, options = {}) {
        return this.request(endpoint, { ...options, method: 'DELETE' });
    }

    // Enhanced CRUD operations with state management integration
    async createClient(clientData) {
        
        try {
            const result = await this.post('/clients', clientData, { priority: 'high' });
            
            // Update state manager
            if (this.stateManager) {
                const clients = this.stateManager.getState('clients');
                const newClient = { ...clientData, id: result.data?.client?.id || result.client?.id };
                this.stateManager.setState('clients', [...clients, newClient]);
            }
            
            return result;
        } catch (error) {
            console.error('❌ Failed to create client:', error);
            throw error;
        }
    }

    async updateClient(id, clientData) {
        
        try {
            const result = await this.patch(`/clients/${id}`, clientData, { priority: 'high' });
            
            // Update state manager
            if (this.stateManager) {
                const clients = this.stateManager.getState('clients');
                const updatedClients = clients.map(c => 
                    c.id === id ? { ...c, ...clientData } : c
                );
                this.stateManager.setState('clients', updatedClients);
            }
            
            return result;
        } catch (error) {
            console.error(`❌ Failed to update client ${id}:`, error);
            throw error;
        }
    }

    async deleteClient(id) {
        
        try {
            const result = await this.delete(`/clients/${id}`, { priority: 'high' });
            
            // Update state manager
            if (this.stateManager) {
                const clients = this.stateManager.getState('clients');
                const filteredClients = clients.filter(c => c.id !== id);
                this.stateManager.setState('clients', filteredClients);
            }
            
            return result;
        } catch (error) {
            console.error(`❌ Failed to delete client ${id}:`, error);
            throw error;
        }
    }

    async getClients() {
        
        try {
            const result = await this.get('/clients', { priority: 'normal' });
            
            // Update state manager
            if (this.stateManager) {
                this.stateManager.setState('clients', result.clients || result.data?.clients || []);
            }
            
            return result;
        } catch (error) {
            console.error('❌ Failed to fetch clients:', error);
            throw error;
        }
    }

    // Similar methods for other entities
    async createLead(leadData) {
        
        try {
            const result = await this.post('/leads', leadData, { priority: 'high' });
            
            if (this.stateManager) {
                const leads = this.stateManager.getState('leads');
                const newLead = { ...leadData, id: result.data?.lead?.id || result.lead?.id };
                this.stateManager.setState('leads', [...leads, newLead]);
            }
            
            return result;
        } catch (error) {
            console.error('❌ Failed to create lead:', error);
            throw error;
        }
    }

    async updateLead(id, leadData) {
        
        try {
            const result = await this.patch(`/leads/${id}`, leadData, { priority: 'high' });
            
            if (this.stateManager) {
                const leads = this.stateManager.getState('leads');
                const updatedLeads = leads.map(l => 
                    l.id === id ? { ...l, ...leadData } : l
                );
                this.stateManager.setState('leads', updatedLeads);
            }
            
            return result;
        } catch (error) {
            console.error(`❌ Failed to update lead ${id}:`, error);
            throw error;
        }
    }

    async deleteLead(id) {
        
        try {
            const result = await this.delete(`/leads/${id}`, { priority: 'high' });
            
            if (this.stateManager) {
                const leads = this.stateManager.getState('leads');
                const filteredLeads = leads.filter(l => l.id !== id);
                this.stateManager.setState('leads', filteredLeads);
            }
            
            return result;
        } catch (error) {
            console.error(`❌ Failed to delete lead ${id}:`, error);
            throw error;
        }
    }

    async getLeads() {
        
        try {
            const result = await this.get('/leads', { priority: 'normal' });
            
            if (this.stateManager) {
                this.stateManager.setState('leads', result.leads || result.data?.leads || []);
            }
            
            return result;
        } catch (error) {
            console.error('❌ Failed to fetch leads:', error);
            throw error;
        }
    }

    // Generate unique request ID
    generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Get connection status
    getConnectionStatus() {
        return {
            status: this.connectionStatus,
            queuedRequests: this.requestQueue.length,
            pendingRequests: this.pendingRequests.size,
            isProcessingQueue: this.isProcessingQueue
        };
    }

    // Clear all queued requests
    clearQueue() {
        this.requestQueue = [];
        this.pendingRequests.clear();
        
        // Clear all timeouts
        this.requestTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
        this.requestTimeouts.clear();
        
        // Debugging disabled
        if (window.debug && window.debug.enabled) {
        }
    }
}

// Create global instance
window.EnhancedAPIWrapper = new EnhancedAPIWrapper();

// Debug function - disabled by default
window.debugEnhancedAPI = () => {
    // Debugging disabled - uncomment to enable:
};

export default EnhancedAPIWrapper;
