// Database-First API Utility - All data operations go through database
const DatabaseAPI = {
    // API response cache
    cache: new Map(),
    CACHE_DURATION: 30000, // 30 seconds
    
    // Base configuration - Use local API for localhost, production for deployed
    API_BASE: (() => {
        const hostname = window.location.hostname;
        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
        // Always use the current origin's API (works for both localhost and droplet)
        const apiBase = window.location.origin;
        console.log('🔧 DatabaseAPI Base URL:', { hostname, isLocalhost, apiBase });
        return apiBase;
    })(),

    // Make HTTP request with proper error handling
    async makeRequest(endpoint, options = {}) {
        // Check cache for GET requests only
        const isGetRequest = !options.method || options.method === 'GET';
        
        // Normalize endpoint - remove query params for cache key (but keep them for actual request)
        const cacheKey = endpoint.split('?')[0];
        const forceRefresh = options.forceRefresh === true || endpoint.includes('?_t=');
        
        // Handle force refresh FIRST - clear cache and skip check
        if (forceRefresh) {
            console.log(`🔄 Force refresh: clearing cache and bypassing for ${cacheKey}`);
            this.cache.delete(cacheKey);
        } else if (isGetRequest && this.cache.has(cacheKey)) {
            // Only check cache if NOT force refresh
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.CACHE_DURATION) {
                console.log(`⚡ Using cached ${cacheKey} (${Math.round((Date.now() - cached.timestamp) / 1000)}s old)`);
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
        
        console.log('📡 Database API request:', { url, endpoint, options, hasToken: !!token });
        
        try {
            const response = await fetch(url, {
                headers,
                ...options
            });

            console.log('📡 Database API response:', { 
                status: response.status, 
                ok: response.ok, 
                endpoint 
            });

            // Get response text first to check content type
            const responseText = await response.text();
            
            // Try to parse as JSON if it looks like JSON
            let responseData;
            try {
                responseData = JSON.parse(responseText);
                console.log('📡 Database API response data:', responseData);
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
                    // Token expired, clear auth data
                    if (window.storage?.removeToken) window.storage.removeToken();
                    if (window.storage?.removeUser) window.storage.removeUser();
                    throw new Error('Authentication expired. Please log in again.');
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
                    console.log(`✅ Fresh data fetched and cached for ${cacheKey}`);
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
            this.cache.delete(endpoint);
        } else {
            this.cache.clear();
        }
    },

    // Client operations
    async getClients() {
        console.log('📡 Fetching clients from database...');
        return this.makeRequest('/clients');
    },

    async createClient(clientData) {
        return this.makeRequest('/clients', {
            method: 'POST',
            body: JSON.stringify(clientData)
        });
    },

    async updateClient(id, clientData) {
        return this.makeRequest(`/clients/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(clientData)
        });
    },

    async deleteClient(id) {
        return this.makeRequest(`/clients/${id}`, {
            method: 'DELETE'
        });
    },

    // Lead operations
    async getLeads(forceRefresh = false) {
        console.log('📡 Fetching leads from database...', forceRefresh ? '(FORCE REFRESH)' : '');
        if (forceRefresh) {
            // Clear the cache before making the request
            this.clearCache('/leads');
            console.log('🗑️ Lead cache cleared before force refresh');
        }
        return this.makeRequest('/leads', { forceRefresh });
    },

    async createLead(leadData) {
        return this.makeRequest('/leads', {
            method: 'POST',
            body: JSON.stringify(leadData)
        });
    },

    async updateLead(id, leadData) {
        return this.makeRequest(`/leads/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(leadData)
        });
    },

    async deleteLead(id) {
        return this.makeRequest(`/leads/${id}`, {
            method: 'DELETE'
        });
    },

    // Project operations
    async getProjects() {
        console.log('📡 Fetching projects from database...');
        return this.makeRequest('/projects');
    },

    async createProject(projectData) {
        console.log('📤 createProject API call:');
        console.log('  - name:', projectData?.name);
        console.log('  - clientName:', projectData?.clientName);
        console.log('  - full payload:', JSON.stringify(projectData, null, 2));
        return this.makeRequest('/projects', {
            method: 'POST',
            body: JSON.stringify(projectData)
        });
    },

    async updateProject(id, projectData) {
        console.log('📤 updateProject API call:', { id, projectData });
        return this.makeRequest(`/projects/${id}`, {
            method: 'PUT',
            body: JSON.stringify(projectData)
        });
    },

    async deleteProject(id) {
        console.log(`🗑️ Deleting project ${id} from database...`);
        const result = await this.makeRequest(`/projects/${id}`, {
            method: 'DELETE'
        });
        // Clear projects cache after deletion
        this.clearCache('/projects');
        console.log(`✅ Project ${id} deleted successfully`);
        return result;
    },

    // Invoice operations
    async getInvoices() {
        console.log('📡 Fetching invoices from database...');
        return this.makeRequest('/invoices');
    },

    async createInvoice(invoiceData) {
        return this.makeRequest('/invoices', {
            method: 'POST',
            body: JSON.stringify(invoiceData)
        });
    },

    async updateInvoice(id, invoiceData) {
        return this.makeRequest(`/invoices/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(invoiceData)
        });
    },

    async deleteInvoice(id) {
        return this.makeRequest(`/invoices/${id}`, {
            method: 'DELETE'
        });
    },

    // Time entry operations
    async getTimeEntries() {
        console.log('📡 Fetching time entries from database...');
        return this.makeRequest('/time-entries');
    },

    async createTimeEntry(timeEntryData) {
        return this.makeRequest('/time-entries', {
            method: 'POST',
            body: JSON.stringify(timeEntryData)
        });
    },

    async updateTimeEntry(id, timeEntryData) {
        return this.makeRequest(`/time-entries/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(timeEntryData)
        });
    },

    async deleteTimeEntry(id) {
        return this.makeRequest(`/time-entries/${id}`, {
            method: 'DELETE'
        });
    },

    // User operations
    async getUsers() {
        console.log('📡 Fetching users from database...');
        return this.makeRequest('/users');
    },

    async createUser(userData) {
        return this.makeRequest('/users', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
    },

    async updateUser(id, userData) {
        return this.makeRequest(`/users/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(userData)
        });
    },

    async deleteUser(id) {
        return this.makeRequest(`/users/${id}`, {
            method: 'DELETE'
        });
    }
};

// Expose to global scope
window.DatabaseAPI = DatabaseAPI;
