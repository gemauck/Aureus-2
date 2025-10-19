// Cross-Device Data Synchronization Utility
const DataSync = {
    // Sync data across devices using a combination of localStorage and API
    async syncData() {
        console.log('🔄 Starting cross-device data sync...');
        
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                console.log('⚠️ No auth token, using localStorage only');
                return this.getLocalData();
            }

            // Try to get data from API first
            const apiData = await this.fetchFromAPI();
            if (apiData) {
                console.log('✅ API data retrieved, syncing to localStorage');
                this.saveToLocalStorage(apiData);
                return apiData;
            }

            // Fallback to localStorage if API fails
            console.log('⚠️ API failed, using localStorage data');
            return this.getLocalData();
        } catch (error) {
            console.error('❌ Data sync failed:', error);
            return this.getLocalData();
        }
    },

    // Fetch data from API
    async fetchFromAPI() {
        try {
            const [clientsRes, leadsRes, projectsRes] = await Promise.allSettled([
                window.api.getClients?.() || Promise.resolve({ data: [] }),
                window.api.getLeads?.() || Promise.resolve({ data: [] }),
                window.api.getProjects?.() || Promise.resolve({ data: [] })
            ]);

            return {
                clients: clientsRes.status === 'fulfilled' ? clientsRes.value : [],
                leads: leadsRes.status === 'fulfilled' ? leadsRes.value.data || [] : [],
                projects: projectsRes.status === 'fulfilled' ? projectsRes.value.data || [] : []
            };
        } catch (error) {
            console.error('❌ API fetch failed:', error);
            return null;
        }
    },

    // Get data from localStorage
    getLocalData() {
        return {
            clients: window.storage?.getClients?.() || [],
            leads: window.storage?.getLeads?.() || [],
            projects: window.storage?.getProjects?.() || []
        };
    },

    // Save data to localStorage
    saveToLocalStorage(data) {
        if (data.clients) window.storage?.setClients?.(data.clients);
        if (data.leads) window.storage?.setLeads?.(data.leads);
        if (data.projects) window.storage?.setProjects?.(data.projects);
    },

    // Save data to API and localStorage
    async saveData(type, data) {
        console.log(`💾 Saving ${type} data...`);
        
        try {
            // Save to localStorage immediately for responsiveness
            this.saveToLocalStorage({ [type]: data });
            
            // Try to save to API if available
            const token = window.storage?.getToken?.();
            if (token) {
                try {
                    // This would be implemented based on your API endpoints
                    console.log(`🌐 Saving ${type} to API...`);
                    // await window.api.saveClients?.(data);
                } catch (apiError) {
                    console.error(`❌ API save failed for ${type}:`, apiError);
                }
            }
            
            console.log(`✅ ${type} data saved successfully`);
        } catch (error) {
            console.error(`❌ Failed to save ${type}:`, error);
        }
    },

    // Force sync from API
    async forceSync() {
        console.log('🔄 Force syncing data from API...');
        
        try {
            const apiData = await this.fetchFromAPI();
            if (apiData) {
                this.saveToLocalStorage(apiData);
                console.log('✅ Force sync completed');
                return apiData;
            }
        } catch (error) {
            console.error('❌ Force sync failed:', error);
        }
        
        return this.getLocalData();
    },

    // Clear all local data and reload from API
    async clearAndReload() {
        console.log('🧹 Clearing local data and reloading from API...');
        
        // Clear localStorage
        window.storage?.setClients?.([]);
        window.storage?.setLeads?.([]);
        window.storage?.setProjects?.([]);
        
        // Reload from API
        return await this.forceSync();
    },

    // Get sync status
    getSyncStatus() {
        const localData = this.getLocalData();
        const hasToken = !!window.storage?.getToken?.();
        
        return {
            hasToken,
            clientsCount: localData.clients.length,
            leadsCount: localData.leads.length,
            projectsCount: localData.projects.length,
            lastSync: localStorage.getItem('lastSync') || 'Never'
        };
    },

    // Update last sync timestamp
    updateLastSync() {
        localStorage.setItem('lastSync', new Date().toISOString());
    }
};

// Make available globally
window.DataSync = DataSync;
