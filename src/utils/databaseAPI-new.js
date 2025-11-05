// Database-First API Utility - All data operations go through database
const DatabaseAPI = {
    // API response cache
    cache: new Map(),
    CACHE_DURATION: 5000, // 5 seconds - very short to prevent stale data across users
    
    // Base configuration - Use local API for localhost, production for deployed
    API_BASE: (() => {
        const hostname = window.location.hostname;
        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
        // Always use the current origin's API (works for both localhost and droplet)
        const apiBase = window.location.origin;
        const log = window.debug?.log || (() => {});
        log('🔧 DatabaseAPI Base URL:', { hostname, isLocalhost, apiBase });
        return apiBase;
    })(),

    // Make HTTP request with proper error handling
    async makeRequest(endpoint, options = {}) {
        // Check cache for GET requests only
        const isGetRequest = !options.method || options.method === 'GET';
        
        // Normalize endpoint - remove query params for cache key (but keep them for actual request)
        const cacheKey = endpoint.split('?')[0];
        const forceRefresh = options.forceRefresh === true || endpoint.includes('?_t=');
        
        const log = window.debug?.log || (() => {});
        
        // Handle force refresh FIRST - clear cache and skip check
        if (forceRefresh) {
            log(`🔄 Force refresh: clearing cache and bypassing for ${cacheKey}`);
            this.cache.delete(cacheKey);
        } else if (isGetRequest && this.cache.has(cacheKey)) {
            // Only check cache if NOT force refresh
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.CACHE_DURATION) {
                log(`⚡ Using cached ${cacheKey} (${Math.round((Date.now() - cached.timestamp) / 1000)}s old)`);
                return cached.data;
            }
        }
        
        const url = `${this.API_BASE}/api${endpoint}`;
        
        // Get authentication token
        const token = window.storage?.getToken?.();
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        
        // Add authorization header if token exists
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        log('📡 Database API request:', { url, endpoint, options, hasToken: !!token });
        
        try {
            const doFetch = async (hdrs) => fetch(url, { headers: hdrs, credentials: 'include', ...options });
            let response = await doFetch(headers);

            log('📡 Database API response:', { 
                status: response.status, 
                ok: response.ok, 
                endpoint 
            });

            // If unauthorized, try a one-time refresh flow
            if (!response.ok && response.status === 401) {
                try {
                    const refreshRes = await fetch(`${this.API_BASE}/api/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
                    if (refreshRes.ok) {
                        const refreshText = await refreshRes.text();
                        const refreshData = refreshText ? JSON.parse(refreshText) : {};
                        const newToken = refreshData?.data?.accessToken || refreshData?.accessToken;
                        if (newToken && window.storage?.setToken) {
                            window.storage.setToken(newToken);
                            const refreshedHeaders = { ...headers, Authorization: `Bearer ${newToken}` };
                            response = await doFetch(refreshedHeaders);
                        }
                    }
                } catch (_) {
                    // ignore network errors; will handle below
                }
            }

            // Get response text first to check content type
            const responseText = await response.text();
            
            // Try to parse as JSON if it looks like JSON
            let responseData;
            try {
                responseData = JSON.parse(responseText);
                log('📡 Database API response data:', responseData);
            } catch (parseError) {
                console.error('❌ Failed to parse response as JSON. Response text:', responseText.substring(0, 200));
                if (!response.ok) {
                    throw new Error(`Server returned ${response.status}: ${response.statusText}. Response: ${responseText.substring(0, 100)}...`);
                }
                // If OK but not JSON, return the text
                responseData = { message: responseText };
            }

            if (!response.ok) {
                if (response.status === 401) {
                    // Do not auto-logout for permission-only endpoints
                    const permissionLikely = cacheKey.startsWith('/users') || cacheKey.startsWith('/admin');
                    if (!permissionLikely) {
                        if (window.storage?.removeToken) window.storage.removeToken();
                        if (window.storage?.removeUser) window.storage.removeUser();
                        if (window.LiveDataSync) {
                            window.LiveDataSync.stop();
                        }
                        if (!window.location.hash.includes('#/login')) {
                            window.location.hash = '#/login';
                        }
                    }
                    throw new Error('Authentication expired or unauthorized.');
                }
                
                // Extract error message from response
                const errorMessage = responseData?.error?.message || responseData?.message || `HTTP ${response.status}: ${response.statusText}`;
                console.error('❌ Error response:', responseData);
                throw new Error(errorMessage);
            }

            // Cache successful GET responses (even after force refresh, cache the fresh data)
            if (isGetRequest && responseData) {
                this.cache.set(cacheKey, {
                    data: responseData,
                    timestamp: Date.now()
                });
                if (forceRefresh) {
                    const log = window.debug?.log || (() => {});
                    log(`✅ Fresh data fetched and cached for ${cacheKey}`);
                }
            }
            
            return responseData;
        } catch (error) {
            console.error(`Database API request failed (${endpoint}):`, error);
            throw error;
        }
    },
    
    // Clear cache
    clearCache(endpoint) {
        if (endpoint) {
            // Normalize endpoint - remove query params
            const cacheKey = endpoint.split('?')[0];
            this.cache.delete(cacheKey);
            
            // Also clear related caches
            if (cacheKey === '/leads' || cacheKey === '/clients') {
                // Clear both leads and clients caches since they're related
                this.cache.delete('/leads');
                this.cache.delete('/clients');
                
                // Clear ClientCache and localStorage for leads/clients
                if (window.ClientCache) {
                    if (cacheKey === '/leads') {
                        window.ClientCache.clearLeadsCache();
                    }
                    if (cacheKey === '/clients') {
                        window.ClientCache.clearClientsCache();
                    }
                }
                
                // Clear localStorage to prevent stale data across users
                if (cacheKey === '/leads' && window.storage?.removeLeads) {
                    window.storage.removeLeads();
                    console.log('🗑️ Cleared localStorage for leads');
                }
                if (cacheKey === '/clients' && window.storage?.removeClients) {
                    window.storage.removeClients();
                    console.log('🗑️ Cleared localStorage for clients');
                }
            }
            
            const log = window.debug?.log || (() => {});
            log(`🗑️ Cleared cache for ${cacheKey}`);
        } else {
            this.cache.clear();
        }
    },

    // Client operations
    async getClients() {
        const log = window.debug?.log || (() => {});
        log('📡 Fetching clients from database...');
        // Add cache-busting timestamp to ensure fresh data
        return this.makeRequest('/clients?_t=' + Date.now(), { forceRefresh: true });
    },

    async getClient(id) {
        const log = window.debug?.log || (() => {});
        log(`📡 Fetching client ${id} from database...`);
        return this.makeRequest(`/clients/${id}`);
    },

    async createClient(clientData) {
        const result = await this.makeRequest('/clients', {
            method: 'POST',
            body: JSON.stringify(clientData)
        });
        // Clear clients cache after creation to ensure fresh data on next fetch
        this.clearCache('/clients');
        return result;
    },

    async updateClient(id, clientData) {
        const result = await this.makeRequest(`/clients/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(clientData)
        });
        // Clear clients cache after update to ensure fresh data on next fetch
        this.clearCache('/clients');
        const log = window.debug?.log || (() => {});
        log('✅ Client cache cleared after update');
        return result;
    },

    async deleteClient(id) {
        const result = await this.makeRequest(`/clients/${id}`, {
            method: 'DELETE'
        });
        // Clear clients cache after deletion to ensure fresh data on next fetch
        this.clearCache('/clients');
        return result;
    },

    // Lead operations
    async getLeads(forceRefresh = false) {
        const log = window.debug?.log || (() => {});
        log('📡 Fetching leads from database...', forceRefresh ? '(FORCE REFRESH)' : '');
        if (forceRefresh) {
            // Clear the cache before making the request
            this.clearCache('/leads');
            log('🗑️ Lead cache cleared before force refresh');
            // Add timestamp to bypass any other caches
            return this.makeRequest(`/leads?_t=${Date.now()}`, { forceRefresh: true });
        }
        return this.makeRequest('/leads', { forceRefresh });
    },

    async getLead(id) {
        const log = window.debug?.log || (() => {});
        log(`📡 Fetching lead ${id} from database...`);
        return this.makeRequest(`/leads/${id}`);
    },

    async createLead(leadData) {
        const result = await this.makeRequest('/leads', {
            method: 'POST',
            body: JSON.stringify(leadData)
        });
        // Clear leads cache after creation to ensure fresh data on next fetch
        this.clearCache('/leads');
        return result;
    },

    async updateLead(id, leadData) {
        const log = window.debug?.log || (() => {});
        log('📤 Updating lead:', { id, status: leadData.status, stage: leadData.stage });
        const result = await this.makeRequest(`/leads/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(leadData)
        });
        // Clear BOTH /leads AND /clients caches since leads appear in both endpoints
        this.clearCache('/leads');
        this.clearCache('/clients'); // ← THIS IS CRITICAL - leads are in clients list too!
        log('✅ Lead and client caches cleared after lead update');
        return result;
    },

    async deleteLead(id) {
        const result = await this.makeRequest(`/leads/${id}`, {
            method: 'DELETE'
        });
        // Clear leads cache after deletion to ensure fresh data on next fetch
        this.clearCache('/leads');
        return result;
    },

    // Project operations
    async getProjects() {
        const log = window.debug?.log || (() => {});
        log('📡 Fetching projects from database...');
        return this.makeRequest('/projects');
    },

    async getProject(id) {
        const log = window.debug?.log || (() => {});
        log(`📡 Fetching project ${id} from database...`);
        return this.makeRequest(`/projects/${id}`);
    },

    async createProject(projectData) {
        const log = window.debug?.log || (() => {});
        log('📤 createProject API call:');
        log('  - name:', projectData?.name);
        log('  - clientName:', projectData?.clientName);
        log('  - full payload:', JSON.stringify(projectData, null, 2));
        const result = await this.makeRequest('/projects', {
            method: 'POST',
            body: JSON.stringify(projectData)
        });
        // Clear projects cache after creation to ensure fresh data on next fetch
        this.clearCache('/projects');
        return result;
    },

    async updateProject(id, projectData) {
        const log = window.debug?.log || (() => {});
        log('📤 updateProject API call:', { id, projectData });
        const result = await this.makeRequest(`/projects/${id}`, {
            method: 'PUT',
            body: JSON.stringify(projectData)
        });
        // Clear projects cache after update to ensure fresh data on next fetch
        this.clearCache('/projects');
        log('✅ Project cache cleared after update');
        return result;
    },

    async deleteProject(id) {
        const log = window.debug?.log || (() => {});
        log(`🗑️ Deleting project ${id} from database...`);
        const result = await this.makeRequest(`/projects/${id}`, {
            method: 'DELETE'
        });
        // Clear projects cache after deletion
        this.clearCache('/projects');
        log(`✅ Project ${id} deleted successfully`);
        return result;
    },

    // Invoice operations
    async getInvoices() {
        const log = window.debug?.log || (() => {});
        log('📡 Fetching invoices from database...');
        return this.makeRequest('/invoices');
    },

    async getInvoice(id) {
        const log = window.debug?.log || (() => {});
        log(`📡 Fetching invoice ${id} from database...`);
        return this.makeRequest(`/invoices/${id}`);
    },

    async createInvoice(invoiceData) {
        const result = await this.makeRequest('/invoices', {
            method: 'POST',
            body: JSON.stringify(invoiceData)
        });
        // Clear invoices cache after creation to ensure fresh data on next fetch
        this.clearCache('/invoices');
        return result;
    },

    async updateInvoice(id, invoiceData) {
        const result = await this.makeRequest(`/invoices/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(invoiceData)
        });
        // Clear invoices cache after update to ensure fresh data on next fetch
        this.clearCache('/invoices');
        const log = window.debug?.log || (() => {});
        log('✅ Invoice cache cleared after update');
        return result;
    },

    async deleteInvoice(id) {
        const result = await this.makeRequest(`/invoices/${id}`, {
            method: 'DELETE'
        });
        // Clear invoices cache after deletion to ensure fresh data on next fetch
        this.clearCache('/invoices');
        return result;
    },

    // Time entry operations
    async getTimeEntries() {
        const log = window.debug?.log || (() => {});
        log('📡 Fetching time entries from database...');
        return this.makeRequest('/time-entries');
    },

    async getTimeEntry(id) {
        const log = window.debug?.log || (() => {});
        log(`📡 Fetching time entry ${id} from database...`);
        return this.makeRequest(`/time-entries/${id}`);
    },

    async createTimeEntry(timeEntryData) {
        const result = await this.makeRequest('/time-entries', {
            method: 'POST',
            body: JSON.stringify(timeEntryData)
        });
        // Clear time entries cache after creation to ensure fresh data on next fetch
        this.clearCache('/time-entries');
        return result;
    },

    async updateTimeEntry(id, timeEntryData) {
        const result = await this.makeRequest(`/time-entries/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(timeEntryData)
        });
        // Clear time entries cache after update to ensure fresh data on next fetch
        this.clearCache('/time-entries');
        const log = window.debug?.log || (() => {});
        log('✅ Time entry cache cleared after update');
        return result;
    },

    async deleteTimeEntry(id) {
        const result = await this.makeRequest(`/time-entries/${id}`, {
            method: 'DELETE'
        });
        // Clear time entries cache after deletion to ensure fresh data on next fetch
        this.clearCache('/time-entries');
        return result;
    },

    // User operations
    async getUsers() {
        const log = window.debug?.log || (() => {});
        log('📡 Fetching users from database...');
        return this.makeRequest('/users');
    },

    async getUser(id) {
        const log = window.debug?.log || (() => {});
        log(`📡 Fetching user ${id} from database...`);
        return this.makeRequest(`/users/${id}`);
    },

    async createUser(userData) {
        const result = await this.makeRequest('/users', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
        // Clear users cache after creation to ensure fresh data on next fetch
        this.clearCache('/users');
        return result;
    },

    async updateUser(id, userData) {
        const result = await this.makeRequest(`/users/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(userData)
        });
        // Clear users cache after update to ensure fresh data on next fetch
        this.clearCache('/users');
        const log = window.debug?.log || (() => {});
        log('✅ User cache cleared after update');
        return result;
    },

    async deleteUser(id) {
        const result = await this.makeRequest(`/users/${id}`, {
            method: 'DELETE'
        });
        // Clear users cache after deletion to ensure fresh data on next fetch
        this.clearCache('/users');
        return result;
    },

    // Manufacturing operations - Inventory
    async getInventory() {
        const log = window.debug?.log || (() => {});
        log('📡 Fetching inventory from database...');
        return this.makeRequest('/manufacturing/inventory');
    },

    async createInventoryItem(itemData) {
        const result = await this.makeRequest('/manufacturing/inventory', {
            method: 'POST',
            body: JSON.stringify(itemData)
        });
        this.clearCache('/manufacturing/inventory');
        return result;
    },

    async updateInventoryItem(id, itemData) {
        const result = await this.makeRequest(`/manufacturing/inventory/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(itemData)
        });
        this.clearCache('/manufacturing/inventory');
        return result;
    },

    async deleteInventoryItem(id) {
        const result = await this.makeRequest(`/manufacturing/inventory/${id}`, {
            method: 'DELETE'
        });
        this.clearCache('/manufacturing/inventory');
        return result;
    },

    // Manufacturing operations - BOMs
    async getBOMs() {
        const log = window.debug?.log || (() => {});
        log('📡 Fetching BOMs from database...');
        return this.makeRequest('/manufacturing/boms');
    },

    async createBOM(bomData) {
        const result = await this.makeRequest('/manufacturing/boms', {
            method: 'POST',
            body: JSON.stringify(bomData)
        });
        this.clearCache('/manufacturing/boms');
        return result;
    },

    async updateBOM(id, bomData) {
        const result = await this.makeRequest(`/manufacturing/boms/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(bomData)
        });
        this.clearCache('/manufacturing/boms');
        return result;
    },

    async deleteBOM(id) {
        const result = await this.makeRequest(`/manufacturing/boms/${id}`, {
            method: 'DELETE'
        });
        this.clearCache('/manufacturing/boms');
        return result;
    },

    // Manufacturing operations - Production Orders
    async getProductionOrders() {
        const log = window.debug?.log || (() => {});
        log('📡 Fetching production orders from database...');
        return this.makeRequest('/manufacturing/production-orders');
    },

    async createProductionOrder(orderData) {
        const result = await this.makeRequest('/manufacturing/production-orders', {
            method: 'POST',
            body: JSON.stringify(orderData)
        });
        this.clearCache('/manufacturing/production-orders');
        return result;
    },

    async updateProductionOrder(id, orderData) {
        const result = await this.makeRequest(`/manufacturing/production-orders/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(orderData)
        });
        this.clearCache('/manufacturing/production-orders');
        return result;
    },

    async deleteProductionOrder(id) {
        const result = await this.makeRequest(`/manufacturing/production-orders/${id}`, {
            method: 'DELETE'
        });
        this.clearCache('/manufacturing/production-orders');
        return result;
    },

    // Manufacturing operations - Stock Movements
    async getStockMovements() {
        const log = window.debug?.log || (() => {});
        log('📡 Fetching stock movements from database...');
        return this.makeRequest('/manufacturing/stock-movements');
    },

    async createStockMovement(movementData) {
        const result = await this.makeRequest('/manufacturing/stock-movements', {
            method: 'POST',
            body: JSON.stringify(movementData)
        });
        this.clearCache('/manufacturing/stock-movements');
        return result;
    },

    async deleteStockMovement(id) {
        const result = await this.makeRequest(`/manufacturing/stock-movements/${id}`, {
            method: 'DELETE'
        });
        this.clearCache('/manufacturing/stock-movements');
        return result;
    },

    // Manufacturing operations - Suppliers
    async getSuppliers() {
        const log = window.debug?.log || (() => {});
        log('📡 Fetching suppliers from database...');
        return this.makeRequest('/manufacturing/suppliers');
    },

    async createSupplier(supplierData) {
        const result = await this.makeRequest('/manufacturing/suppliers', {
            method: 'POST',
            body: JSON.stringify(supplierData)
        });
        this.clearCache('/manufacturing/suppliers');
        return result;
    },

    async updateSupplier(id, supplierData) {
        const result = await this.makeRequest(`/manufacturing/suppliers/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(supplierData)
        });
        this.clearCache('/manufacturing/suppliers');
        return result;
    },

    async deleteSupplier(id) {
        const result = await this.makeRequest(`/manufacturing/suppliers/${id}`, {
            method: 'DELETE'
        });
        this.clearCache('/manufacturing/suppliers');
        return result;
    }
};

// Expose to global scope
window.DatabaseAPI = DatabaseAPI;
