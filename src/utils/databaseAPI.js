// Database-First API Utility - All data operations go through database
const DatabaseAPI = {
    // Base configuration - Use local API for localhost, production for deployed
    API_BASE: (() => {
        const hostname = window.location.hostname;
        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
        // Always use the current origin's API (works for both localhost and droplet)
        const apiBase = window.location.origin;
        console.log('🔧 DatabaseAPI Base URL:', { hostname, isLocalhost, apiBase });
        return apiBase;
    })(),
    
    // Request deduplication: prevent multiple concurrent requests to the same endpoint
    _pendingRequests: new Map(),
    
    // Short-term cache for recent responses (2 seconds TTL)
    _responseCache: new Map(),
    _cacheTTL: 2000, // 2 seconds
    
    // Clear old cache entries periodically
    _cleanCache() {
        const now = Date.now();
        for (const [key, { timestamp }] of this._responseCache.entries()) {
            if (now - timestamp > this._cacheTTL) {
                this._responseCache.delete(key);
            }
        }
    },
    
    // Helper function to check if an error is a network error (retry-able)
    isNetworkError(error) {
        if (!error) return false;
        // Check for network-related error types
        const errorMessage = error.message?.toLowerCase() || '';
        const errorName = error.name?.toLowerCase() || '';
        const errorString = error.toString().toLowerCase();
        
        return (
            errorName === 'typeerror' ||
            errorMessage.includes('failed to fetch') ||
            errorMessage.includes('networkerror') ||
            errorMessage.includes('network request failed') ||
            errorMessage.includes('err_internet_disconnected') ||
            errorMessage.includes('err_network_changed') ||
            errorMessage.includes('err_connection_refused') ||
            errorMessage.includes('err_connection_reset') ||
            errorMessage.includes('err_connection_timed_out') ||
            errorString.includes('networkerror') ||
            errorString.includes('failed to fetch')
        );
    },

    // Helper function to make authenticated requests with retry logic
    async makeRequest(endpoint, options = {}) {
        // Clean old cache entries periodically
        this._cleanCache();
        
        // Create a cache key from endpoint and method (ignore body for caching)
        const method = (options.method || 'GET').toUpperCase();
        const cacheKey = `${method}:${endpoint}`;
        
        // Check cache first (only for GET requests)
        if (method === 'GET') {
            const cached = this._responseCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < this._cacheTTL) {
                console.log(`⚡ DatabaseAPI: Serving ${endpoint} from cache`);
                return cached.data;
            }
        }
        
        // Check if there's already a pending request for this endpoint
        // Deduplicate concurrent requests
        if (this._pendingRequests.has(cacheKey)) {
            console.log(`🔄 DatabaseAPI: Deduplicating concurrent request to ${endpoint}`);
            try {
                const result = await this._pendingRequests.get(cacheKey);
                return result;
            } catch (error) {
                // If the pending request failed, we'll retry below
                this._pendingRequests.delete(cacheKey);
            }
        }
        
        // Create the request promise and store it for deduplication
        const requestPromise = this._executeRequest(endpoint, options);
        this._pendingRequests.set(cacheKey, requestPromise);
        
        // Clean up after request completes (whether success or failure)
        requestPromise.finally(() => {
            this._pendingRequests.delete(cacheKey);
        });
        
        try {
            const result = await requestPromise;
            
            // Cache successful GET responses
            if (method === 'GET') {
                this._responseCache.set(cacheKey, {
                    data: result,
                    timestamp: Date.now()
                });
            }
            
            return result;
        } catch (error) {
            // Don't cache errors
            throw error;
        }
    },
    
    // Internal method to execute the actual request
    async _executeRequest(endpoint, options = {}) {
        const maxRetries = 3;
        const baseDelay = 1000; // Start with 1 second
        
        let token = window.storage?.getToken?.();
        
        if (token) {
            console.log('🔑 Token found, length:', token.length);
        } else {
            console.log('⚠️ No token found, attempting refresh...');
        }

        // If no token, attempt a silent refresh using the refresh cookie
        if (!token) {
            try {
                const refreshUrl = `${this.API_BASE}/api/auth/refresh`;
                const refreshRes = await fetch(refreshUrl, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
                if (refreshRes.ok) {
                    const text = await refreshRes.text();
                    const refreshData = text ? JSON.parse(text) : {};
                    const newToken = refreshData?.data?.accessToken || refreshData?.accessToken;
                    if (newToken && window.storage?.setToken) {
                        console.log('✅ Token obtained from refresh');
                        window.storage.setToken(newToken);
                        token = newToken;
                    } else {
                        console.error('❌ Refresh response OK but no token in response');
                    }
                } else {
                    console.error('❌ Refresh failed with status:', refreshRes.status);
                }
            } catch (refreshError) {
                console.error('❌ Refresh error:', refreshError);
                // ignore refresh errors here; downstream logic will handle redirect
            }
        }

        if (!token) {
            // Still no token → ensure clean state and redirect to login
            if (window.storage?.removeToken) window.storage.removeToken();
            if (window.storage?.removeUser) window.storage.removeUser();
            if (window.LiveDataSync) {
                window.LiveDataSync.stop();
            }
            if (!window.location.hash.includes('#/login')) {
                window.location.hash = '#/login';
            }
            throw new Error('No authentication token found. Please log in.');
        }

        const url = `${this.API_BASE}/api${endpoint}`;
        const buildConfigWithToken = (authToken) => {
            // Extract headers from options to prevent them from overriding Authorization
            const { headers: customHeaders, ...restOptions } = options;
            
            // Merge headers properly - ensure Authorization is always included and not overridden
            const mergedHeaders = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
                ...(customHeaders || {})
            };
            
            // Explicitly set Authorization again to ensure it's never overridden
            mergedHeaders['Authorization'] = `Bearer ${authToken}`;
            
            const config = {
                method: restOptions.method || 'GET',
                headers: mergedHeaders,
                credentials: 'include',
                ...restOptions
            };
            
            // Final safeguard: ensure Authorization header is never overridden by restOptions
            if (config.headers) {
                config.headers['Authorization'] = `Bearer ${authToken}`;
            }
            
            // Log POST requests for debugging
            if (config.method === 'POST' || config.method === 'PATCH' || config.method === 'PUT') {
                const authHeader = config.headers['Authorization'];
                console.log(`📤 ${config.method} request to ${endpoint}:`, {
                    url,
                    hasBody: !!config.body,
                    bodyLength: config.body?.length || 0,
                    bodyPreview: config.body ? config.body.substring(0, 200) : 'no body',
                    hasAuthHeader: !!authHeader,
                    authHeaderPreview: authHeader ? 
                        (authHeader.startsWith('Bearer ') ? authHeader.substring(0, 37) + '...' : 'Invalid format') : 'missing',
                    tokenLength: authHeader ? (authHeader.startsWith('Bearer ') ? authHeader.length - 7 : 0) : 0
                });
            }
            
            return config;
        };

        const execute = async (authToken) => {
            const config = buildConfigWithToken(authToken);
            const response = await fetch(url, config);
            return response;
        };

        // Retry loop for network errors
        let lastError = null;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                let response = await execute(token);

                if (!response.ok && response.status === 401) {
                    // Attempt refresh once before giving up
                    console.log('🔄 Got 401, attempting token refresh...');
                    try {
                        const refreshUrl = `${this.API_BASE}/api/auth/refresh`;
                        const refreshRes = await fetch(refreshUrl, { 
                            method: 'POST', 
                            credentials: 'include', 
                            headers: { 'Content-Type': 'application/json' } 
                        });
                        
                        if (refreshRes.ok) {
                            const text = await refreshRes.text();
                            const refreshData = text ? JSON.parse(text) : {};
                            const newToken = refreshData?.data?.accessToken || refreshData?.accessToken;
                            if (newToken && window.storage?.setToken) {
                                console.log('✅ Token refreshed successfully');
                                window.storage.setToken(newToken);
                                token = newToken;
                                // Retry the original request with the new token
                                response = await execute(newToken);
                                console.log('✅ Retried request after refresh, status:', response.status);
                            } else {
                                console.error('❌ Token refresh failed: No token in response');
                            }
                        } else {
                            console.error('❌ Token refresh failed with status:', refreshRes.status);
                        }
                    } catch (refreshError) {
                        console.error('❌ Token refresh error:', refreshError);
                        // Continue to throw the original 401 error
                    }
                }

                if (!response.ok) {
                    // Try to extract backend error message for better debugging
                    let serverErrorMessage = '';
                    try {
                        const text = await response.text();
                        if (text) {
                            try {
                                const json = JSON.parse(text);
                                // Prefer nested error.message if present
                                serverErrorMessage =
                                    (json && json.error && typeof json.error === 'object' && json.error.message) ||
                                    json?.message ||
                                    json?.data?.message ||
                                    // Fallback if error is a string
                                    (typeof json?.error === 'string' ? json.error : '');
                            } catch (_) {
                                serverErrorMessage = text.substring(0, 200);
                            }
                        }
                    } catch (_) {
                        // ignore parse failures
                    }

                    if (response.status === 401) {
                        // Avoid logging out for pure permission denials or notification endpoints
                        // /users, /admin = permission issues
                        // /notifications = notification polling, shouldn't redirect
                        const permissionLikely = endpoint.startsWith('/users') || endpoint.startsWith('/admin') || endpoint.startsWith('/notifications');
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
                        throw new Error(serverErrorMessage || 'Authentication expired or unauthorized.');
                    }
                    const statusText = response.statusText || 'Error';
                    const msg = serverErrorMessage ? ` ${serverErrorMessage}` : '';
                    throw new Error(`HTTP ${response.status}: ${statusText}${msg}`);
                }

                // Check if response is JSON
                const contentType = response.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                    const text = await response.text();
                    console.error(`Non-JSON response from ${endpoint}:`, text.substring(0, 200));
                    throw new Error(`Server returned non-JSON response. Status: ${response.status}`);
                }

                const data = await response.json();
                // Only log for non-cached responses to reduce noise
                if (!this._responseCache.has(`${(options.method || 'GET').toUpperCase()}:${endpoint}`)) {
                    console.log(`📥 API Response for ${endpoint}:`, {
                        status: response.status,
                        hasData: !!data,
                        dataKeys: Object.keys(data || {}),
                        dataStructure: endpoint === '/projects' ? {
                            hasProjects: !!(data?.data?.projects),
                            projectsCount: data?.data?.projects?.length || 0,
                            rawData: data
                        } : 'other endpoint'
                    });
                }
                return data;
            } catch (error) {
                lastError = error;
                
                // Only retry on network errors, not on HTTP errors or auth errors
                const isNetwork = this.isNetworkError(error);
                const shouldRetry = isNetwork && attempt < maxRetries;
                
                if (shouldRetry) {
                    // Calculate exponential backoff delay: 1s, 2s, 4s
                    const delay = baseDelay * Math.pow(2, attempt);
                    console.warn(`⚠️ Network error on ${endpoint} (attempt ${attempt + 1}/${maxRetries + 1}). Retrying in ${delay}ms...`, error.message);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue; // Retry the request
                } else {
                    // Don't retry - log and throw
                    if (isNetwork && attempt === maxRetries) {
                        console.error(`❌ Database API request failed after ${maxRetries + 1} attempts (${endpoint}):`, error);
                        throw new Error(`Network error: Unable to connect to server. Please check your internet connection and try again.`);
                    } else {
                        console.error(`❌ Database API request failed (${endpoint}):`, error);
                        throw error;
                    }
                }
            }
        }
        
        // Should never reach here, but just in case
        throw lastError || new Error(`Unknown error occurred while making request to ${endpoint}`);
    },

    // CLIENT OPERATIONS
    async getClients() {
        console.log('📡 Fetching clients from database...');
        const response = await this.makeRequest('/clients');
        const clients = response?.data?.clients || [];
        console.log(`✅ Clients fetched from database: ${clients.length}`);
        return response;
    },

    async getClient(id) {
        console.log(`📡 Fetching client ${id} from database...`);
        const response = await this.makeRequest(`/clients/${id}`);
        console.log('✅ Client fetched from database');
        return response;
    },

    async createClient(clientData) {
        console.log('📡 Creating client in database...');
        const response = await this.makeRequest('/clients', {
            method: 'POST',
            body: JSON.stringify(clientData)
        });
        console.log('✅ Client created in database');
        return response;
    },

    async updateClient(id, clientData) {
        console.log(`📡 Updating client ${id} in database...`);
        const response = await this.makeRequest(`/clients/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(clientData)
        });
        console.log('✅ Client updated in database');
        return response;
    },

    async deleteClient(id) {
        console.log(`📡 Deleting client ${id} from database...`);
        const response = await this.makeRequest(`/clients/${id}`, {
            method: 'DELETE'
        });
        console.log('✅ Client deleted from database');
        return response;
    },

    // LEAD OPERATIONS
    async getLeads(forceRefresh = false) {
        console.log('📡 Fetching leads from database...', forceRefresh ? '(FORCE REFRESH)' : '');
        // If forceRefresh, we need to bypass any caching layers
        // Add cache-busting query param to bypass any HTTP/proxy caches
        const endpoint = forceRefresh ? `/leads?_t=${Date.now()}` : '/leads';
        console.log('🔄 Lead API endpoint:', endpoint);
        const raw = await this.makeRequest(endpoint);
        // Normalize payload to { data: { leads: [...] } } for downstream consumers
        const normalized = {
            data: {
                leads: Array.isArray(raw?.data?.leads)
                    ? raw.data.leads
                    : Array.isArray(raw?.data)
                        ? raw.data
                        : []
            }
        };
        console.log('✅ Leads fetched from database:', normalized.data.leads.length);
        return normalized;
    },

    async getLead(id) {
        console.log(`📡 Fetching lead ${id} from database...`);
        const response = await this.makeRequest(`/leads/${id}`);
        console.log('✅ Lead fetched from database');
        return response;
    },

    async createLead(leadData) {
        console.log('📡 Creating lead in database...');
        const response = await this.makeRequest('/leads', {
            method: 'POST',
            body: JSON.stringify(leadData)
        });
        console.log('✅ Lead created in database');
        return response;
    },

    async updateLead(id, leadData) {
        console.log(`📡 Updating lead ${id} in database...`);
        console.log(`📦 Lead data being sent:`, JSON.stringify(leadData, null, 2));
        const response = await this.makeRequest(`/leads/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(leadData)
        });
        console.log('✅ Lead updated in database');
        return response;
    },

    async deleteLead(id) {
        console.log(`📡 Deleting lead ${id} from database...`);
        const response = await this.makeRequest(`/leads/${id}`, {
            method: 'DELETE'
        });
        console.log('✅ Lead deleted from database');
        return response;
    },

    // PROJECT OPERATIONS
    async getProjects() {
        console.log('📡 Fetching projects from database...');
        const response = await this.makeRequest('/projects');
        const projectsCount = response?.data?.projects?.length || response?.data?.length || response?.projects?.length || 0;
        console.log('✅ Projects fetched from database:', projectsCount);
        return response;
    },

    async getProject(id) {
        console.log(`📡 Fetching project ${id} from database...`);
        const response = await this.makeRequest(`/projects/${id}`);
        console.log('✅ Project fetched from database');
        return response;
    },

    async createProject(projectData) {
        console.log('📡 Creating project in database...');
        const response = await this.makeRequest('/projects', {
            method: 'POST',
            body: JSON.stringify(projectData)
        });
        console.log('✅ Project created in database');
        return response;
    },

    async updateProject(id, projectData) {
        console.log(`📡 Updating project ${id} in database...`);
        const response = await this.makeRequest(`/projects/${id}`, {
            method: 'PUT',
            body: JSON.stringify(projectData)
        });
        console.log('✅ Project updated in database');
        return response;
    },

    async deleteProject(id) {
        console.log(`📡 Deleting project ${id} from database...`);
        const response = await this.makeRequest(`/projects/${id}`, {
            method: 'DELETE'
        });
        console.log('✅ Project deleted from database');
        return response;
    },

    // INVOICE OPERATIONS
    async getInvoices() {
        console.log('📡 Fetching invoices from database...');
        const response = await this.makeRequest('/invoices');
        console.log('✅ Invoices fetched from database:', response.data?.length || 0);
        return response;
    },

    async getInvoice(id) {
        console.log(`📡 Fetching invoice ${id} from database...`);
        const response = await this.makeRequest(`/invoices/${id}`);
        console.log('✅ Invoice fetched from database');
        return response;
    },

    async createInvoice(invoiceData) {
        console.log('📡 Creating invoice in database...');
        const response = await this.makeRequest('/invoices', {
            method: 'POST',
            body: JSON.stringify(invoiceData)
        });
        console.log('✅ Invoice created in database');
        return response;
    },

    async updateInvoice(id, invoiceData) {
        console.log(`📡 Updating invoice ${id} in database...`);
        const response = await this.makeRequest(`/invoices/${id}`, {
            method: 'PUT',
            body: JSON.stringify(invoiceData)
        });
        console.log('✅ Invoice updated in database');
        return response;
    },

    async deleteInvoice(id) {
        console.log(`📡 Deleting invoice ${id} from database...`);
        const response = await this.makeRequest(`/invoices/${id}`, {
            method: 'DELETE'
        });
        console.log('✅ Invoice deleted from database');
        return response;
    },

    // TIME TRACKING OPERATIONS
    async getTimeEntries() {
        console.log('📡 Fetching time entries from database...');
        const response = await this.makeRequest('/time-entries');
        console.log('✅ Time entries fetched from database:', response.data?.length || 0);
        return response;
    },

    async createTimeEntry(timeEntryData) {
        console.log('📡 Creating time entry in database...');
        const response = await this.makeRequest('/time-entries', {
            method: 'POST',
            body: JSON.stringify(timeEntryData)
        });
        console.log('✅ Time entry created in database');
        return response;
    },

    async updateTimeEntry(id, timeEntryData) {
        console.log(`📡 Updating time entry ${id} in database...`);
        const response = await this.makeRequest(`/time-entries/${id}`, {
            method: 'PUT',
            body: JSON.stringify(timeEntryData)
        });
        console.log('✅ Time entry updated in database');
        return response;
    },

    async deleteTimeEntry(id) {
        console.log(`📡 Deleting time entry ${id} from database...`);
        const response = await this.makeRequest(`/time-entries/${id}`, {
            method: 'DELETE'
        });
        console.log('✅ Time entry deleted from database');
        return response;
    },

    // USER OPERATIONS
    async getUsers() {
        console.log('📡 Fetching users from database...');
        const response = await this.makeRequest('/users');
        const usersCount = response.data?.users?.length || response.data?.data?.users?.length || (Array.isArray(response.data) ? response.data.length : 0);
        console.log('✅ Users fetched from database:', usersCount);
        return response;
    },

    async inviteUser(userData) {
        console.log('📡 Inviting user via database...');
        const response = await this.makeRequest('/users/invite', {
            method: 'POST',
            body: JSON.stringify(userData)
        });
        console.log('✅ User invitation sent via database');
        return response;
    },

    // SETTINGS OPERATIONS
    async getSettings() {
        console.log('📡 Fetching system settings from database...');
        const response = await this.makeRequest('/settings');
        console.log('✅ Settings fetched from database');
        return response;
    },

    async updateSettings(settingsData) {
        console.log('📡 Updating system settings in database...');
        const response = await this.makeRequest('/settings', {
            method: 'PUT',
            body: JSON.stringify(settingsData)
        });
        console.log('✅ Settings updated in database');
        return response;
    },

    // BULK OPERATIONS
    async bulkUpdateClients(clientsData) {
        console.log('📡 Bulk updating clients in database...');
        const response = await this.makeRequest('/clients/bulk', {
            method: 'PUT',
            body: JSON.stringify({ clients: clientsData })
        });
        console.log('✅ Clients bulk updated in database');
        return response;
    },

    async bulkDeleteClients(clientIds) {
        console.log('📡 Bulk deleting clients from database...');
        const response = await this.makeRequest('/clients/bulk', {
            method: 'DELETE',
            body: JSON.stringify({ ids: clientIds })
        });
        console.log('✅ Clients bulk deleted from database');
        return response;
    },

    // SEARCH OPERATIONS
    async searchClients(query) {
        console.log('📡 Searching clients in database...');
        const response = await this.makeRequest(`/clients/search?q=${encodeURIComponent(query)}`);
        console.log('✅ Client search completed in database');
        return response;
    },

    async searchLeads(query) {
        console.log('📡 Searching leads in database...');
        const response = await this.makeRequest(`/leads/search?q=${encodeURIComponent(query)}`);
        console.log('✅ Lead search completed in database');
        return response;
    },

    // ANALYTICS OPERATIONS
    async getClientAnalytics() {
        console.log('📡 Fetching client analytics from database...');
        const response = await this.makeRequest('/analytics/clients');
        console.log('✅ Client analytics fetched from database');
        return response;
    },

    async getLeadAnalytics() {
        console.log('📡 Fetching lead analytics from database...');
        const response = await this.makeRequest('/analytics/leads');
        console.log('✅ Lead analytics fetched from database');
        return response;
    },

    async getRevenueAnalytics() {
        console.log('📡 Fetching revenue analytics from database...');
        const response = await this.makeRequest('/analytics/revenue');
        console.log('✅ Revenue analytics fetched from database');
        return response;
    },

    // OPPORTUNITIES OPERATIONS
    async getOpportunities() {
        console.log('📡 Fetching opportunities from database...');
        const response = await this.makeRequest('/opportunities');
        console.log('✅ Opportunities fetched from database:', response.data?.opportunities?.length || 0);
        return response;
    },

    async getOpportunitiesByClient(clientId) {
        console.log(`📡 Fetching opportunities for client ${clientId} from database...`);
        const response = await this.makeRequest(`/opportunities/client/${clientId}`);
        console.log('✅ Client opportunities fetched from database:', response.data?.opportunities?.length || 0);
        return response;
    },

    async createOpportunity(opportunityData) {
        console.log('📡 Creating opportunity in database...');
        const response = await this.makeRequest('/opportunities', {
            method: 'POST',
            body: JSON.stringify(opportunityData)
        });
        console.log('✅ Opportunity created in database');
        return response;
    },

    async updateOpportunity(id, opportunityData) {
        console.log(`📡 Updating opportunity ${id} in database...`);
        const response = await this.makeRequest(`/opportunities/${id}`, {
            method: 'PUT',
            body: JSON.stringify(opportunityData)
        });
        console.log('✅ Opportunity updated in database');
        return response;
    },

    async deleteOpportunity(id) {
        console.log(`📡 Deleting opportunity ${id} from database...`);
        const response = await this.makeRequest(`/opportunities/${id}`, {
            method: 'DELETE'
        });
        console.log('✅ Opportunity deleted from database');
        return response;
    },

    // MANUFACTURING OPERATIONS - INVENTORY
    async getInventory(locationId = null) {
        console.log('📡 Fetching inventory from database...', locationId ? `(location: ${locationId})` : '(all locations)');
        const endpoint = locationId && locationId !== 'all' ? `/manufacturing/inventory?locationId=${locationId}` : '/manufacturing/inventory';
        const raw = await this.makeRequest(endpoint);
        const normalized = {
            data: {
                inventory: Array.isArray(raw?.data?.inventory)
                    ? raw.data.inventory
                    : Array.isArray(raw?.inventory)
                        ? raw.inventory
                        : Array.isArray(raw?.data)
                            ? raw.data
                            : []
            }
        };
        console.log('✅ Inventory fetched from database:', normalized.data.inventory.length);
        return normalized;
    },

    async createInventoryItem(itemData) {
        console.log('📡 Creating inventory item in database...');
        const response = await this.makeRequest('/manufacturing/inventory', {
            method: 'POST',
            body: JSON.stringify(itemData)
        });
        console.log('✅ Inventory item created in database');
        return response;
    },

    async updateInventoryItem(id, itemData) {
        console.log(`📡 Updating inventory item ${id} in database...`);
        const response = await this.makeRequest(`/manufacturing/inventory/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(itemData)
        });
        console.log('✅ Inventory item updated in database');
        return response;
    },

    async deleteInventoryItem(id) {
        console.log(`📡 Deleting inventory item ${id} from database...`);
        const response = await this.makeRequest(`/manufacturing/inventory/${id}`, {
            method: 'DELETE'
        });
        console.log('✅ Inventory item deleted from database');
        return response;
    },

    // MANUFACTURING OPERATIONS - STOCK LOCATIONS
    async getStockLocations() {
        console.log('📡 Fetching stock locations from database...');
        const raw = await this.makeRequest('/manufacturing/locations');
        const normalized = {
            data: {
                locations: Array.isArray(raw?.data?.locations)
                    ? raw.data.locations
                    : Array.isArray(raw?.locations)
                        ? raw.locations
                        : Array.isArray(raw?.data)
                            ? raw.data
                            : []
            }
        };
        console.log('✅ Stock locations fetched from database:', normalized.data.locations.length);
        return normalized;
    },

    async createStockLocation(locationData) {
        console.log('📡 Creating stock location in database...');
        console.log('📡 Location data being sent:', locationData);
        
        try {
            const response = await this.makeRequest('/manufacturing/locations', {
                method: 'POST',
                body: JSON.stringify(locationData),
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            console.log('✅ Stock location created in database');
            console.log('✅ API Response:', response);
            return response;
        } catch (error) {
            console.error('❌ Error in createStockLocation:', error);
            console.error('❌ Error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
            throw error;
        }
    },

    async updateStockLocation(id, locationData) {
        console.log(`📡 Updating stock location ${id} in database...`);
        const response = await this.makeRequest(`/manufacturing/locations/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(locationData)
        });
        console.log('✅ Stock location updated in database');
        return response;
    },

    async deleteStockLocation(id) {
        console.log(`📡 Deleting stock location ${id} from database...`);
        const response = await this.makeRequest(`/manufacturing/locations/${id}`, {
            method: 'DELETE'
        });
        console.log('✅ Stock location deleted from database');
        return response;
    },

    // MANUFACTURING OPERATIONS - BOMs
    async getBOMs() {
        console.log('📡 Fetching BOMs from database...');
        const raw = await this.makeRequest('/manufacturing/boms');
        const normalized = {
            data: {
                boms: Array.isArray(raw?.data?.boms)
                    ? raw.data.boms
                    : Array.isArray(raw?.boms)
                        ? raw.boms
                        : Array.isArray(raw?.data)
                            ? raw.data
                            : []
            }
        };
        console.log('✅ BOMs fetched from database:', normalized.data.boms.length);
        return normalized;
    },

    async createBOM(bomData) {
        console.log('📡 Creating BOM in database...');
        const response = await this.makeRequest('/manufacturing/boms', {
            method: 'POST',
            body: JSON.stringify(bomData)
        });
        console.log('✅ BOM created in database');
        return response;
    },

    async updateBOM(id, bomData) {
        console.log(`📡 Updating BOM ${id} in database...`);
        const response = await this.makeRequest(`/manufacturing/boms/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(bomData)
        });
        console.log('✅ BOM updated in database');
        return response;
    },

    async deleteBOM(id) {
        console.log(`📡 Deleting BOM ${id} from database...`);
        const response = await this.makeRequest(`/manufacturing/boms/${id}`, {
            method: 'DELETE'
        });
        console.log('✅ BOM deleted from database');
        return response;
    },

    // MANUFACTURING OPERATIONS - PRODUCTION ORDERS
    async getProductionOrders() {
        console.log('📡 Fetching production orders from database...');
        const raw = await this.makeRequest('/manufacturing/production-orders');
        const normalized = {
            data: {
                productionOrders: Array.isArray(raw?.data?.productionOrders)
                    ? raw.data.productionOrders
                    : Array.isArray(raw?.productionOrders)
                        ? raw.productionOrders
                        : Array.isArray(raw?.data)
                            ? raw.data
                            : []
            }
        };
        console.log('✅ Production orders fetched from database:', normalized.data.productionOrders.length);
        return normalized;
    },

    async createProductionOrder(orderData) {
        console.log('📡 Creating production order in database...');
        const response = await this.makeRequest('/manufacturing/production-orders', {
            method: 'POST',
            body: JSON.stringify(orderData)
        });
        console.log('✅ Production order created in database');
        return response;
    },

    async updateProductionOrder(id, orderData) {
        console.log(`📡 Updating production order ${id} in database...`);
        const response = await this.makeRequest(`/manufacturing/production-orders/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(orderData)
        });
        console.log('✅ Production order updated in database');
        return response;
    },

    async deleteProductionOrder(id) {
        console.log(`📡 Deleting production order ${id} from database...`);
        const response = await this.makeRequest(`/manufacturing/production-orders/${id}`, {
            method: 'DELETE'
        });
        console.log('✅ Production order deleted from database');
        return response;
    },

    // SALES ORDERS
    async getSalesOrders() {
        console.log('📡 Fetching sales orders from database...');
        const raw = await this.makeRequest('/sales-orders');
        const normalized = {
            data: {
                salesOrders: Array.isArray(raw?.data?.salesOrders)
                    ? raw.data.salesOrders
                    : Array.isArray(raw?.salesOrders)
                        ? raw.salesOrders
                        : Array.isArray(raw?.data)
                            ? raw.data
                            : []
            }
        };
        console.log('✅ Sales orders fetched from database:', normalized.data.salesOrders.length);
        return normalized;
    },

    async createSalesOrder(orderData) {
        console.log('📡 Creating sales order in database...');
        const response = await this.makeRequest('/sales-orders', {
            method: 'POST',
            body: JSON.stringify(orderData)
        });
        console.log('✅ Sales order created in database');
        return response;
    },

    async updateSalesOrder(id, orderData) {
        console.log(`📡 Updating sales order ${id} in database...`);
        const response = await this.makeRequest(`/sales-orders/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(orderData)
        });
        console.log('✅ Sales order updated in database');
        return response;
    },

    async deleteSalesOrder(id) {
        console.log(`📡 Deleting sales order ${id} from database...`);
        const response = await this.makeRequest(`/sales-orders/${id}`, {
            method: 'DELETE'
        });
        console.log('✅ Sales order deleted from database');
        return response;
    },

    // PURCHASE ORDERS
    async getPurchaseOrders() {
        console.log('📡 Fetching purchase orders from database...');
        const raw = await this.makeRequest('/purchase-orders');
        const normalized = {
            data: {
                purchaseOrders: Array.isArray(raw?.data?.purchaseOrders)
                    ? raw.data.purchaseOrders
                    : Array.isArray(raw?.purchaseOrders)
                        ? raw.purchaseOrders
                        : Array.isArray(raw?.data)
                            ? raw.data
                            : []
            }
        };
        console.log('✅ Purchase orders fetched from database:', normalized.data.purchaseOrders.length);
        return normalized;
    },

    async createPurchaseOrder(orderData) {
        console.log('📡 Creating purchase order in database...');
        const response = await this.makeRequest('/purchase-orders', {
            method: 'POST',
            body: JSON.stringify(orderData)
        });
        console.log('✅ Purchase order created in database');
        return response;
    },

    async updatePurchaseOrder(id, orderData) {
        console.log(`📡 Updating purchase order ${id} in database...`);
        const response = await this.makeRequest(`/purchase-orders/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(orderData)
        });
        console.log('✅ Purchase order updated in database');
        return response;
    },

    async deletePurchaseOrder(id) {
        console.log(`📡 Deleting purchase order ${id} from database...`);
        const response = await this.makeRequest(`/purchase-orders/${id}`, {
            method: 'DELETE'
        });
        console.log('✅ Purchase order deleted from database');
        return response;
    },

    // MANUFACTURING OPERATIONS - STOCK MOVEMENTS
    async getStockMovements() {
        console.log('📡 Fetching stock movements from database...');
        const raw = await this.makeRequest('/manufacturing/stock-movements');
        const normalized = {
            data: {
                movements: Array.isArray(raw?.data?.movements)
                    ? raw.data.movements
                    : Array.isArray(raw?.movements)
                        ? raw.movements
                        : Array.isArray(raw?.data)
                            ? raw.data
                            : []
            }
        };
        console.log('✅ Stock movements fetched from database:', normalized.data.movements.length);
        return normalized;
    },

    // STOCK TRANSACTIONS (per-location aware)
    async createStockTransaction(data) {
        console.log('📡 Creating stock transaction...', data?.type)
        const response = await this.makeRequest('/manufacturing/stock-transactions', {
            method: 'POST',
            body: JSON.stringify(data)
        })
        console.log('✅ Stock transaction created')
        return response
    },

    async createStockMovement(movementData) {
        console.log('📡 Creating stock movement in database...');
        const response = await this.makeRequest('/manufacturing/stock-movements', {
            method: 'POST',
            body: JSON.stringify(movementData)
        });
        console.log('✅ Stock movement created in database');
        return response;
    },

    async deleteStockMovement(id) {
        console.log(`📡 Deleting stock movement ${id} from database...`);
        const response = await this.makeRequest(`/manufacturing/stock-movements/${id}`, {
            method: 'DELETE'
        });
        console.log('✅ Stock movement deleted from database');
        return response;
    },

    // MANUFACTURING OPERATIONS - RECEIVING AND BOM CONSUMPTION
    async receiveStock(receiptData) {
        console.log('📡 Receiving stock via database...')
        const response = await this.makeRequest('/manufacturing/stock-movements', {
            method: 'POST',
            body: JSON.stringify({
                ...receiptData,
                type: 'receipt'
            })
        })
        console.log('✅ Stock received in database')
        return response
    },

    async consumeBomForProduction(orderId, payload = {}) {
        console.log(`📡 Consuming BOM for production order ${orderId}...`)
        const response = await this.makeRequest(`/manufacturing/production-orders/${orderId}/consume`, {
            method: 'POST',
            body: JSON.stringify(payload)
        })
        console.log('✅ BOM consumption completed in database')
        return response
    },

    // MANUFACTURING OPERATIONS - SUPPLIERS
    async getSuppliers() {
        console.log('📡 Fetching suppliers from database...');
        const raw = await this.makeRequest('/manufacturing/suppliers');
        const normalized = {
            data: {
                suppliers: Array.isArray(raw?.data?.suppliers)
                    ? raw.data.suppliers
                    : Array.isArray(raw?.suppliers)
                        ? raw.suppliers
                        : Array.isArray(raw?.data)
                            ? raw.data
                            : []
            }
        };
        console.log('✅ Suppliers fetched from database:', normalized.data.suppliers.length);
        return normalized;
    },

    async createSupplier(supplierData) {
        console.log('📡 Creating supplier in database...');
        const response = await this.makeRequest('/manufacturing/suppliers', {
            method: 'POST',
            body: JSON.stringify(supplierData)
        });
        console.log('✅ Supplier created in database');
        return response;
    },

    async updateSupplier(id, supplierData) {
        console.log(`📡 Updating supplier ${id} in database...`);
        const response = await this.makeRequest(`/manufacturing/suppliers/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(supplierData)
        });
        console.log('✅ Supplier updated in database');
        return response;
    },

    async deleteSupplier(id) {
        console.log(`📡 Deleting supplier ${id} from database...`);
        const response = await this.makeRequest(`/manufacturing/suppliers/${id}`, {
            method: 'DELETE'
        });
        console.log('✅ Supplier deleted from database');
        return response;
    },

    // JOB CARDS OPERATIONS
    async getJobCards() {
        console.log('📡 Fetching job cards from database...');
        const raw = await this.makeRequest('/jobcards');
        const normalized = {
            data: {
                jobCards: Array.isArray(raw?.data?.jobCards)
                    ? raw.data.jobCards
                    : Array.isArray(raw?.jobCards)
                        ? raw.jobCards
                        : Array.isArray(raw?.data)
                            ? raw.data
                            : []
            }
        };
        console.log('✅ Job cards fetched from database:', normalized.data.jobCards.length);
        return normalized;
    },

    async getJobCard(id) {
        console.log(`📡 Fetching job card ${id} from database...`);
        const response = await this.makeRequest(`/jobcards/${id}`);
        return response;
    },

    async createJobCard(jobCardData) {
        console.log('📡 Creating job card in database...');
        const response = await this.makeRequest('/jobcards', {
            method: 'POST',
            body: JSON.stringify(jobCardData)
        });
        console.log('✅ Job card created in database');
        // Clear cache for job cards list to ensure fresh data
        this._responseCache.delete('GET:/jobcards');
        console.log('🗑️ Cleared job cards cache after create');
        return response;
    },

    async updateJobCard(id, jobCardData) {
        console.log(`📡 Updating job card ${id} in database...`);
        const response = await this.makeRequest(`/jobcards/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(jobCardData)
        });
        console.log('✅ Job card updated in database');
        // Clear cache for both list and individual job card
        this._responseCache.delete('GET:/jobcards');
        this._responseCache.delete(`GET:/jobcards/${id}`);
        console.log('🗑️ Cleared job cards cache after update');
        return response;
    },

    async deleteJobCard(id) {
        console.log(`📡 Deleting job card ${id} from database...`);
        const response = await this.makeRequest(`/jobcards/${id}`, {
            method: 'DELETE'
        });
        console.log('✅ Job card deleted from database');
        // Clear cache for job cards list and individual job card to ensure fresh data
        this._responseCache.delete('GET:/jobcards');
        this._responseCache.delete(`GET:/jobcards/${id}`);
        console.log('🗑️ Cleared job cards cache after delete');
        return response;
    },

    // STAR CLIENT/LEAD
    async starClient(clientId) {
        console.log(`⭐ Starring client/lead ${clientId}...`);
        const response = await this.makeRequest(`/starred-clients/${clientId}`, {
            method: 'PUT'
        });
        console.log('✅ Client/lead starred');
        // Clear cache for clients and leads to refresh starred status
        this._responseCache.delete('GET:/clients');
        this._responseCache.delete('GET:/leads');
        return response;
    },

    async unstarClient(clientId) {
        console.log(`⭐ Unstarring client/lead ${clientId}...`);
        const response = await this.makeRequest(`/starred-clients/${clientId}`, {
            method: 'PUT'
        });
        console.log('✅ Client/lead unstarred');
        // Clear cache for clients and leads to refresh starred status
        this._responseCache.delete('GET:/clients');
        this._responseCache.delete('GET:/leads');
        return response;
    },

    async toggleStarClient(clientId) {
        console.log(`⭐ Toggling star for client/lead ${clientId}...`);
        const response = await this.makeRequest(`/starred-clients/${clientId}`, {
            method: 'PUT'
        });
        console.log('✅ Star toggled');
        // Clear cache for clients and leads to refresh starred status
        this._responseCache.delete('GET:/clients');
        this._responseCache.delete('GET:/leads');
        return response;
    },

    async getStarredClients() {
        console.log('⭐ Fetching starred clients/leads...');
        const response = await this.makeRequest('/starred-clients');
        return response;
    },

    // VEHICLES
    async getVehicles() {
        console.log('📡 Fetching vehicles from database...');
        const response = await this.makeRequest('/vehicles');
        console.log('✅ Vehicles fetched from database');
        return response;
    },

    async getVehicle(id) {
        console.log(`📡 Fetching vehicle ${id} from database...`);
        const response = await this.makeRequest(`/vehicles/${id}`);
        console.log('✅ Vehicle fetched from database');
        return response;
    },

    async createVehicle(vehicleData) {
        console.log('📡 Creating vehicle in database...');
        const response = await this.makeRequest('/vehicles', {
            method: 'POST',
            body: JSON.stringify(vehicleData)
        });
        console.log('✅ Vehicle created in database');
        return response;
    },

    async updateVehicle(id, vehicleData) {
        console.log(`📡 Updating vehicle ${id} in database...`);
        const response = await this.makeRequest(`/vehicles/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(vehicleData)
        });
        console.log('✅ Vehicle updated in database');
        return response;
    },

    async deleteVehicle(id) {
        console.log(`📡 Deleting vehicle ${id} from database...`);
        const response = await this.makeRequest(`/vehicles/${id}`, {
            method: 'DELETE'
        });
        console.log('✅ Vehicle deleted from database');
        return response;
    },

    // HEALTH CHECK
    async healthCheck() {
        console.log('📡 Checking database health...');
        const response = await this.makeRequest('/health');
        console.log('✅ Database health check completed');
        return response;
    }
};

// Make available globally
window.DatabaseAPI = DatabaseAPI;

// Update the existing API object to use database operations
if (window.api) {
    // Replace existing API methods with database-first versions
    window.api.getClients = DatabaseAPI.getClients.bind(DatabaseAPI);
    window.api.createClient = DatabaseAPI.createClient.bind(DatabaseAPI);
    window.api.updateClient = DatabaseAPI.updateClient.bind(DatabaseAPI);
    window.api.deleteClient = DatabaseAPI.deleteClient.bind(DatabaseAPI);
    
    window.api.getLeads = DatabaseAPI.getLeads.bind(DatabaseAPI);
    window.api.createLead = DatabaseAPI.createLead.bind(DatabaseAPI);
    window.api.updateLead = DatabaseAPI.updateLead.bind(DatabaseAPI);
    window.api.deleteLead = DatabaseAPI.deleteLead.bind(DatabaseAPI);
    
    window.api.getProjects = DatabaseAPI.getProjects.bind(DatabaseAPI);
    window.api.getProject = DatabaseAPI.getProject.bind(DatabaseAPI);
    window.api.createProject = DatabaseAPI.createProject.bind(DatabaseAPI);
    window.api.updateProject = DatabaseAPI.updateProject.bind(DatabaseAPI);
    window.api.deleteProject = DatabaseAPI.deleteProject.bind(DatabaseAPI);
    
    window.api.getInvoices = DatabaseAPI.getInvoices.bind(DatabaseAPI);
    window.api.createInvoice = DatabaseAPI.createInvoice.bind(DatabaseAPI);
    window.api.updateInvoice = DatabaseAPI.updateInvoice.bind(DatabaseAPI);
    window.api.deleteInvoice = DatabaseAPI.deleteInvoice.bind(DatabaseAPI);
    
    window.api.getTimeEntries = DatabaseAPI.getTimeEntries.bind(DatabaseAPI);
    window.api.createTimeEntry = DatabaseAPI.createTimeEntry.bind(DatabaseAPI);
    window.api.updateTimeEntry = DatabaseAPI.updateTimeEntry.bind(DatabaseAPI);
    window.api.deleteTimeEntry = DatabaseAPI.deleteTimeEntry.bind(DatabaseAPI);
    
    window.api.getUsers = DatabaseAPI.getUsers.bind(DatabaseAPI);
    window.api.inviteUser = DatabaseAPI.inviteUser.bind(DatabaseAPI);
    
    window.api.bulkUpdateClients = DatabaseAPI.bulkUpdateClients.bind(DatabaseAPI);
    window.api.bulkDeleteClients = DatabaseAPI.bulkDeleteClients.bind(DatabaseAPI);
    
    window.api.searchClients = DatabaseAPI.searchClients.bind(DatabaseAPI);
    window.api.searchLeads = DatabaseAPI.searchLeads.bind(DatabaseAPI);
    
    window.api.getClientAnalytics = DatabaseAPI.getClientAnalytics.bind(DatabaseAPI);
    window.api.getLeadAnalytics = DatabaseAPI.getLeadAnalytics.bind(DatabaseAPI);
    window.api.getRevenueAnalytics = DatabaseAPI.getRevenueAnalytics.bind(DatabaseAPI);
    
    // Starred clients API methods
    window.api.starClient = DatabaseAPI.starClient.bind(DatabaseAPI);
    window.api.unstarClient = DatabaseAPI.unstarClient.bind(DatabaseAPI);
    window.api.toggleStarClient = DatabaseAPI.toggleStarClient.bind(DatabaseAPI);
    window.api.getStarredClients = DatabaseAPI.getStarredClients.bind(DatabaseAPI);
    
    // Opportunities API methods
    window.api.getOpportunities = DatabaseAPI.getOpportunities.bind(DatabaseAPI);
    window.api.getOpportunitiesByClient = DatabaseAPI.getOpportunitiesByClient.bind(DatabaseAPI);
    window.api.createOpportunity = DatabaseAPI.createOpportunity.bind(DatabaseAPI);
    window.api.updateOpportunity = DatabaseAPI.updateOpportunity.bind(DatabaseAPI);
    window.api.deleteOpportunity = DatabaseAPI.deleteOpportunity.bind(DatabaseAPI);
    
    window.api.healthCheck = DatabaseAPI.healthCheck.bind(DatabaseAPI);
}
