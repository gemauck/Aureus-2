// Client Data Cache - Optimizes client loading performance
const ClientCache = {
    // Cache storage with timestamps
    cache: {
        clients: null,
        clientsTimestamp: null,
        leads: null,
        leadsTimestamp: null,
        projects: null,
        projectsTimestamp: null,
        invoices: null,
        invoicesTimestamp: null,
        timeEntries: null,
        timeEntriesTimestamp: null
    },

    // Cache duration (5 minutes)
    CACHE_DURATION: 5 * 60 * 1000,

    // Check if cache is valid
    isCacheValid(timestamp) {
        if (!timestamp) return false;
        return (Date.now() - timestamp) < this.CACHE_DURATION;
    },

    // Get cached clients with immediate return
    getClients() {
        if (this.isCacheValid(this.cache.clientsTimestamp)) {
            console.log('⚡ ClientCache: Returning cached clients');
            return this.cache.clients || [];
        }
        return null;
    },

    // Set cached clients
    setClients(clients) {
        this.cache.clients = clients;
        this.cache.clientsTimestamp = Date.now();
        console.log('💾 ClientCache: Cached clients updated');
    },

    // Get cached leads
    getLeads() {
        if (this.isCacheValid(this.cache.leadsTimestamp)) {
            console.log('⚡ ClientCache: Returning cached leads');
            return this.cache.leads || [];
        }
        return null;
    },

    // Set cached leads
    setLeads(leads) {
        this.cache.leads = leads;
        this.cache.leadsTimestamp = Date.now();
        console.log('💾 ClientCache: Cached leads updated');
    },

    // Get cached projects
    getProjects() {
        if (this.isCacheValid(this.cache.projectsTimestamp)) {
            console.log('⚡ ClientCache: Returning cached projects');
            return this.cache.projects || [];
        }
        return null;
    },

    // Set cached projects
    setProjects(projects) {
        this.cache.projects = projects;
        this.cache.projectsTimestamp = Date.now();
        console.log('💾 ClientCache: Cached projects updated');
    },

    // Get cached invoices
    getInvoices() {
        if (this.isCacheValid(this.cache.invoicesTimestamp)) {
            console.log('⚡ ClientCache: Returning cached invoices');
            return this.cache.invoices || [];
        }
        return null;
    },

    // Set cached invoices
    setInvoices(invoices) {
        this.cache.invoices = invoices;
        this.cache.invoicesTimestamp = Date.now();
        console.log('💾 ClientCache: Cached invoices updated');
    },

    // Get cached time entries
    getTimeEntries() {
        if (this.isCacheValid(this.cache.timeEntriesTimestamp)) {
            console.log('⚡ ClientCache: Returning cached time entries');
            return this.cache.timeEntries || [];
        }
        return null;
    },

    // Set cached time entries
    setTimeEntries(timeEntries) {
        this.cache.timeEntries = timeEntries;
        this.cache.timeEntriesTimestamp = Date.now();
        console.log('💾 ClientCache: Cached time entries updated');
    },

    // Clear all cache
    clearCache() {
        this.cache = {
            clients: null,
            clientsTimestamp: null,
            leads: null,
            leadsTimestamp: null,
            projects: null,
            projectsTimestamp: null,
            invoices: null,
            invoicesTimestamp: null,
            timeEntries: null,
            timeEntriesTimestamp: null
        };
        console.log('🧹 ClientCache: All cache cleared');
    },

    // Force refresh clients from API (bypass cache)
    async forceRefreshClients() {
        console.log('🔄 ClientCache: Force refreshing clients from API...');
        try {
            if (window.DatabaseAPI?.getClients) {
                const response = await window.DatabaseAPI.getClients();
                const clients = response.data?.clients || [];
                
                // Update cache
                this.setClients(clients);
                
                // Update localStorage
                if (window.storage?.setClients) {
                    window.storage.setClients(clients);
                }
                
                console.log('✅ ClientCache: Clients force refreshed:', clients.length);
                return clients;
            } else {
                console.warn('⚠️ ClientCache: DatabaseAPI not available for force refresh');
                return this.getClients() || [];
            }
        } catch (error) {
            console.error('❌ ClientCache: Force refresh failed:', error);
            return this.getClients() || [];
        }
    },

    // Get cache status
    getCacheStatus() {
        return {
            clients: {
                cached: !!this.cache.clients,
                valid: this.isCacheValid(this.cache.clientsTimestamp),
                age: this.cache.clientsTimestamp ? Date.now() - this.cache.clientsTimestamp : null
            },
            leads: {
                cached: !!this.cache.leads,
                valid: this.isCacheValid(this.cache.leadsTimestamp),
                age: this.cache.leadsTimestamp ? Date.now() - this.cache.leadsTimestamp : null
            },
            projects: {
                cached: !!this.cache.projects,
                valid: this.isCacheValid(this.cache.projectsTimestamp),
                age: this.cache.projectsTimestamp ? Date.now() - this.cache.projectsTimestamp : null
            },
            invoices: {
                cached: !!this.cache.invoices,
                valid: this.isCacheValid(this.cache.invoicesTimestamp),
                age: this.cache.invoicesTimestamp ? Date.now() - this.cache.invoicesTimestamp : null
            },
            timeEntries: {
                cached: !!this.cache.timeEntries,
                valid: this.isCacheValid(this.cache.timeEntriesTimestamp),
                age: this.cache.timeEntriesTimestamp ? Date.now() - this.cache.timeEntriesTimestamp : null
            }
        };
    },

    // Optimized data loading with cache-first strategy
    async loadDataWithCache() {
        console.log('🚀 ClientCache: Starting optimized data load...');
        
        // IMMEDIATE: Try cache first
        const cachedClients = this.getClients();
        const cachedLeads = this.getLeads();
        const cachedProjects = this.getProjects();
        const cachedInvoices = this.getInvoices();
        const cachedTimeEntries = this.getTimeEntries();

        // If we have valid cache for all data, return immediately
        if (cachedClients !== null && cachedLeads !== null && cachedProjects !== null && 
            cachedInvoices !== null && cachedTimeEntries !== null) {
            console.log('⚡ ClientCache: All data served from cache');
            return {
                clients: cachedClients,
                leads: cachedLeads,
                projects: cachedProjects,
                invoices: cachedInvoices,
                timeEntries: cachedTimeEntries,
                fromCache: true
            };
        }

        // FALLBACK: Load from localStorage (leads are database-only)
        console.log('💾 ClientCache: Loading from localStorage...');
        const localStorageClients = window.storage?.getClients?.() || [];
        const localStorageProjects = window.storage?.getProjects?.() || [];
        const localStorageInvoices = window.storage?.getInvoices?.() || [];
        const localStorageTimeEntries = window.storage?.getTimeEntries?.() || [];

        // Update cache with localStorage data (leads are database-only)
        this.setClients(localStorageClients);
        this.setLeads([]); // Leads are database-only
        this.setProjects(localStorageProjects);
        this.setInvoices(localStorageInvoices);
        this.setTimeEntries(localStorageTimeEntries);

        // BACKGROUND: Sync with API if authenticated
        const token = window.storage?.getToken?.();
        if (token && window.DatabaseAPI) {
            console.log('🔄 ClientCache: Syncing with API in background...');
            this.syncWithAPI();
        }

        return {
            clients: localStorageClients,
            leads: localStorageLeads,
            projects: localStorageProjects,
            invoices: localStorageInvoices,
            timeEntries: localStorageTimeEntries,
            fromCache: false
        };
    },

    // Background API sync
    async syncWithAPI() {
        try {
            const syncPromises = [];

            // Only sync if cache is invalid
            if (!this.isCacheValid(this.cache.clientsTimestamp) && window.DatabaseAPI.getClients) {
                syncPromises.push(
                    window.DatabaseAPI.getClients()
                        .then(response => {
                            const clients = response.data?.clients || [];
                            if (clients.length > 0) {
                                this.setClients(clients);
                                // Update localStorage
                                if (window.storage?.setClients) {
                                    window.storage.setClients(clients);
                                }
                            }
                        })
                        .catch(err => console.warn('Client sync failed:', err))
                );
            }

            if (!this.isCacheValid(this.cache.leadsTimestamp) && window.DatabaseAPI.getLeads) {
                syncPromises.push(
                    window.DatabaseAPI.getLeads()
                        .then(response => {
                            const leads = response.data || [];
                            if (leads.length > 0) {
                                this.setLeads(leads);
                                // Leads are database-only, no localStorage sync
                            }
                        })
                        .catch(err => console.warn('Lead sync failed:', err))
                );
            }

            if (!this.isCacheValid(this.cache.projectsTimestamp) && window.DatabaseAPI.getProjects) {
                syncPromises.push(
                    window.DatabaseAPI.getProjects()
                        .then(response => {
                            const projects = response.data || [];
                            if (projects.length > 0) {
                                this.setProjects(projects);
                                if (window.storage?.setProjects) {
                                    window.storage.setProjects(projects);
                                }
                            }
                        })
                        .catch(err => console.warn('Project sync failed:', err))
                );
            }

            if (!this.isCacheValid(this.cache.invoicesTimestamp) && window.DatabaseAPI.getInvoices) {
                syncPromises.push(
                    window.DatabaseAPI.getInvoices()
                        .then(response => {
                            const invoices = response.data || [];
                            if (invoices.length > 0) {
                                this.setInvoices(invoices);
                                if (window.storage?.setInvoices) {
                                    window.storage.setInvoices(invoices);
                                }
                            }
                        })
                        .catch(err => console.warn('Invoice sync failed:', err))
                );
            }

            if (!this.isCacheValid(this.cache.timeEntriesTimestamp) && window.DatabaseAPI.getTimeEntries) {
                syncPromises.push(
                    window.DatabaseAPI.getTimeEntries()
                        .then(response => {
                            const timeEntries = response.data || [];
                            if (timeEntries.length > 0) {
                                this.setTimeEntries(timeEntries);
                                if (window.storage?.setTimeEntries) {
                                    window.storage.setTimeEntries(timeEntries);
                                }
                            }
                        })
                        .catch(err => console.warn('Time entry sync failed:', err))
                );
            }

            // Wait for all sync operations
            await Promise.allSettled(syncPromises);
            console.log('✅ ClientCache: Background sync completed');

        } catch (error) {
            console.error('❌ ClientCache: Background sync failed:', error);
        }
    }
};

// Make available globally
window.ClientCache = ClientCache;

// Debug function
window.debugClientCache = () => {
    console.log('🔍 Client Cache Debug:', ClientCache.getCacheStatus());
};

// Global function to force refresh clients (useful for debugging)
window.forceRefreshClients = async () => {
    console.log('🔄 Force refreshing clients...');
    const clients = await ClientCache.forceRefreshClients();
    console.log('✅ Clients refreshed:', clients.length, 'clients');
    return clients;
};

// Global function to clear all client cache
window.clearClientCache = () => {
    console.log('🧹 Clearing client cache...');
    ClientCache.clearCache();
    if (window.storage?.setClients) {
        window.storage.setClients([]);
    }
    console.log('✅ Client cache cleared');
};

console.log('✅ Client Cache loaded - Optimized data loading ready');
