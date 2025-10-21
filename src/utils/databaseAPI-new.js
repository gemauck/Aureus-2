// Database-First API Utility - All data operations go through database
const DatabaseAPI = {
    // Base configuration - Use local API for localhost, production for deployed
    API_BASE: (() => {
        const hostname = window.location.hostname;
        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
        const apiBase = isLocalhost ? 'http://localhost:3000' : 'https://abco-erp-2-production.up.railway.app';
        console.log('🔧 DatabaseAPI Base URL:', { hostname, isLocalhost, apiBase });
        return apiBase;
    })(),

    // Make HTTP request with proper error handling
    async makeRequest(endpoint, options = {}) {
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

            if (!response.ok) {
                if (response.status === 401) {
                    // Token expired, clear auth data
                    if (window.storage?.removeToken) window.storage.removeToken();
                    if (window.storage?.removeUser) window.storage.removeUser();
                    throw new Error('Authentication expired. Please log in again.');
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`Database API request failed (${endpoint}):`, error);
            throw error;
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
    async getLeads() {
        console.log('📡 Fetching leads from database...');
        return this.makeRequest('/leads');
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
        return this.makeRequest('/projects', {
            method: 'POST',
            body: JSON.stringify(projectData)
        });
    },

    async updateProject(id, projectData) {
        return this.makeRequest(`/projects/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(projectData)
        });
    },

    async deleteProject(id) {
        return this.makeRequest(`/projects/${id}`, {
            method: 'DELETE'
        });
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
