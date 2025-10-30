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
    
    // Helper function to make authenticated requests
    async makeRequest(endpoint, options = {}) {
        let token = window.storage?.getToken?.();

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
                        window.storage.setToken(newToken);
                        token = newToken;
                    }
                }
            } catch (_) {
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
        const buildConfigWithToken = (authToken) => ({
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
                ...options.headers
            },
            credentials: 'include',
            ...options
        });

        const execute = async (authToken) => {
            const response = await fetch(url, buildConfigWithToken(authToken));
            return response;
        };

        try {
            let response = await execute(token);

            if (!response.ok && response.status === 401) {
                // Attempt refresh once
                try {
                    const refreshUrl = `${this.API_BASE}/api/auth/refresh`;
                    const refreshRes = await fetch(refreshUrl, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
                    if (refreshRes.ok) {
                        const text = await refreshRes.text();
                        const refreshData = text ? JSON.parse(text) : {};
                        const newToken = refreshData?.data?.accessToken || refreshData?.accessToken;
                        if (newToken && window.storage?.setToken) {
                            window.storage.setToken(newToken);
                            response = await execute(newToken);
                        }
                    }
                } catch (_) {
                    // ignore refresh network errors; will handle below
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
                    // Avoid logging out for pure permission denials (like /users) – just throw
                    const permissionLikely = endpoint.startsWith('/users') || endpoint.startsWith('/admin');
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
            return data;
        } catch (error) {
            console.error(`Database API request failed (${endpoint}):`, error);
            throw error;
        }
    },

    // CLIENT OPERATIONS
    async getClients() {
        console.log('📡 Fetching clients from database...');
        const response = await this.makeRequest('/clients');
        console.log('✅ Clients fetched from database:', response.data?.clients?.length || 0);
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
        console.log('✅ Users fetched from database:', response.data?.length || 0);
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
    async getInventory() {
        console.log('📡 Fetching inventory from database...');
        const raw = await this.makeRequest('/manufacturing/inventory');
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
    
    // Opportunities API methods
    window.api.getOpportunities = DatabaseAPI.getOpportunities.bind(DatabaseAPI);
    window.api.getOpportunitiesByClient = DatabaseAPI.getOpportunitiesByClient.bind(DatabaseAPI);
    window.api.createOpportunity = DatabaseAPI.createOpportunity.bind(DatabaseAPI);
    window.api.updateOpportunity = DatabaseAPI.updateOpportunity.bind(DatabaseAPI);
    window.api.deleteOpportunity = DatabaseAPI.deleteOpportunity.bind(DatabaseAPI);
    
    window.api.healthCheck = DatabaseAPI.healthCheck.bind(DatabaseAPI);
}
