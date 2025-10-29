// Get dependencies from window
const { useState, useEffect, useMemo, useCallback, useRef } = React;
const storage = window.storage || {};
// Don't access these at module level - they might not be loaded yet
// Access them at runtime inside functions

// Safe storage helper functions
const safeStorage = {
    getClients: () => storage.getClients ? storage.getClients() : null,
    setClients: (data) => storage.setClients ? storage.setClients(data) : null,
    getProjects: () => storage.getProjects ? storage.getProjects() : null,
    setProjects: (data) => storage.setProjects ? storage.setProjects(data) : null,
};

// Performance optimization: Memoized client data processor
let clientDataCache = null;
let clientDataCacheTimestamp = 0;
let lastApiCallTimestamp = 0;
let lastLeadsApiCallTimestamp = 0;
let lastLiveDataSyncTime = 0;
let lastLiveDataClientsHash = null;
const CACHE_DURATION = 60000; // 60 seconds
const API_CALL_INTERVAL = 30000; // Only call API every 30 seconds max
const LIVE_SYNC_THROTTLE = 2000; // Skip LiveDataSync updates if data hasn't changed in 2 seconds

function processClientData(rawClients, cacheKey) {
    // Use cached processed data if available and recent
    const now = Date.now();
    if (clientDataCache && (now - clientDataCacheTimestamp < CACHE_DURATION)) {
        return clientDataCache;
    }
    
    // Ensure rawClients is always an array
    if (!rawClients || !Array.isArray(rawClients)) {
        return [];
    }
    
    // Process the data
    const startTime = performance.now();
    const processed = rawClients.map(c => {
        // Preserve type as-is, don't default null/undefined to 'client'
        // This ensures leads aren't accidentally converted to clients
        const clientType = c.type; // Keep null/undefined as-is, don't default
        const isLead = clientType === 'lead';
        let status = c.status;
        
        // Convert status based on type
        if (isLead) {
            // For leads: preserve status as-is (Potential, Active, Disinterested)
            status = c.status || 'Potential';
        } else {
            // For clients: convert lowercase to capitalized
            if (c.status === 'active') status = 'Active';
            else if (c.status === 'inactive') status = 'Inactive';
            else status = c.status || 'Inactive';
        }
        
        return {
        id: c.id,
        name: c.name,
        status: status,
        stage: c.stage || 'Awareness',
        industry: c.industry || 'Other',
        type: clientType, // Preserve null/undefined - will be filtered out later
        revenue: c.revenue || 0,
        lastContact: new Date(c.updatedAt || c.createdAt).toISOString().split('T')[0],
        address: c.address || '',
        website: c.website || '',
        notes: c.notes || '',
        contacts: Array.isArray(c.contacts) ? c.contacts : (typeof c.contacts === 'string' ? JSON.parse(c.contacts || '[]') : []),
        followUps: Array.isArray(c.followUps) ? c.followUps : (typeof c.followUps === 'string' ? JSON.parse(c.followUps || '[]') : []),
        projectIds: Array.isArray(c.projectIds) ? c.projectIds : [],
        comments: Array.isArray(c.comments) ? c.comments : (typeof c.comments === 'string' ? JSON.parse(c.comments || '[]') : []),
        sites: Array.isArray(c.sites) ? c.sites : (typeof c.sites === 'string' ? JSON.parse(c.sites || '[]') : []),
        opportunities: Array.isArray(c.opportunities) ? c.opportunities : [],
        contracts: Array.isArray(c.contracts) ? c.contracts : (typeof c.contracts === 'string' ? JSON.parse(c.contracts || '[]') : []),
        activityLog: Array.isArray(c.activityLog) ? c.activityLog : (typeof c.activityLog === 'string' ? JSON.parse(c.activityLog || '[]') : []),
        billingTerms: typeof c.billingTerms === 'object' ? c.billingTerms : (typeof c.billingTerms === 'string' ? JSON.parse(c.billingTerms || '{}') : {
            paymentTerms: 'Net 30',
            billingFrequency: 'Monthly',
            currency: 'ZAR',
            retainerAmount: 0,
            taxExempt: false,
            notes: ''
        }),
        ownerId: c.ownerId || null,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt
        };
    });
    
    // Cache the result
    clientDataCache = processed;
    clientDataCacheTimestamp = now;
    
    const endTime = performance.now();
    
    return processed;
}

// No initial data - all data comes from database

const Clients = React.memo(() => {
    const [viewMode, setViewMode] = useState('clients');
    const [clients, setClients] = useState([]);

    // Utility function to calculate time since first contact
    const getTimeSinceFirstContact = (firstContactDate) => {
        if (!firstContactDate) return 'Not set';
        
        const firstContact = new Date(firstContactDate);
        const now = new Date();
        const diffTime = Math.abs(now - firstContact);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return '1 day ago';
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`;
        if (diffDays < 365) return `${Math.ceil(diffDays / 30)} months ago`;
        return `${Math.ceil(diffDays / 365)} years ago`;
    };
    const [leads, setLeads] = useState([]);
    const [leadsCount, setLeadsCount] = useState(0);
    const [projects, setProjects] = useState([]);
    const [selectedClient, setSelectedClient] = useState(null);
    const [selectedLead, setSelectedLead] = useState(null);
    const [currentTab, setCurrentTab] = useState('overview');
    const [currentLeadTab, setCurrentLeadTab] = useState('overview');
    // Removed isEditing state - always allow editing
    const [searchTerm, setSearchTerm] = useState('');
    const [filterIndustry, setFilterIndustry] = useState('All Industries');
    const [filterStatus, setFilterStatus] = useState('All Status');
    const [refreshKey, setRefreshKey] = useState(0);
    const [sortField, setSortField] = useState('name');
    const [sortDirection, setSortDirection] = useState('asc');
    const { isDark } = window.useTheme();
    
    // Removed expensive state tracking logging
    
    // Load projects from database
    const loadProjects = async () => {
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                return;
            }
            
            // Try different API methods in order of preference
            let response = null;
            if (window.DatabaseAPI && typeof window.DatabaseAPI.getProjects === 'function') {
                response = await window.DatabaseAPI.getProjects();
            } else if (window.api && typeof window.api.getProjects === 'function') {
                response = await window.api.getProjects();
            } else {
                console.warn('⚠️ No projects API available');
                return;
            }
            
            // Handle different response structures
            let apiProjects = [];
            if (response?.data?.projects) {
                apiProjects = response.data.projects;
            } else if (response?.data?.data?.projects) {
                apiProjects = response.data.data.projects;
            } else if (response?.projects) {
                apiProjects = response.projects;
            } else if (Array.isArray(response?.data)) {
                apiProjects = response.data;
            } else if (Array.isArray(response)) {
                apiProjects = response;
            }
            
            // Ensure projects have both clientId and clientName mapped to client for compatibility
            const normalizedProjects = (Array.isArray(apiProjects) ? apiProjects : []).map(p => ({
                ...p,
                client: p.clientName || p.client || '',
                clientId: p.clientId || null
            }));
            
            setProjects(normalizedProjects);
        } catch (error) {
            console.error('❌ Failed to load projects in Clients component:', error);
            // Don't set projects to empty array on error - keep existing if any
        }
    };

    // Load clients, leads, and projects on mount (boot up)
    useEffect(() => {
        loadClients();
        loadProjects();
        
        // Load full leads data immediately on boot (not just count)
        // This ensures leads are ready when user navigates to leads/pipeline views
        const loadLeadsOnBoot = async () => {
            try {
                const token = window.storage?.getToken?.();
                if (!token || !window.api?.getLeads) return;
                
                // Load full leads data immediately
                await loadLeads();
            } catch (error) {
                // Silent fail - will retry when user navigates to leads tab
            }
        };
        
        // Load leads after a brief delay to not block initial render
        setTimeout(() => loadLeadsOnBoot(), 100);
    }, []);

    // Live sync: subscribe to real-time updates so clients stay fresh without manual refresh
    useEffect(() => {
        const mapDbClient = (c) => {
            const isLead = c.type === 'lead';
            let status = c.status;
            
            // Convert status based on type
            if (isLead) {
                // For leads: preserve status as-is (Potential, Active, Disinterested)
                status = c.status || 'Potential';
            } else {
                // For clients: convert lowercase to capitalized
                if (c.status === 'active') status = 'Active';
                else if (c.status === 'inactive') status = 'Inactive';
                else status = c.status || 'Inactive';
            }
            
            return {
                id: c.id,
                name: c.name,
                status: status,
                industry: c.industry || 'Other',
                type: c.type, // Preserve as-is - null types will be filtered out
                revenue: c.revenue || 0,
                lastContact: new Date(c.updatedAt || c.createdAt || Date.now()).toISOString().split('T')[0],
                address: c.address || '',
                website: c.website || '',
                notes: c.notes || '',
                contacts: Array.isArray(c.contacts) ? c.contacts : [],
                followUps: Array.isArray(c.followUps) ? c.followUps : [],
                projectIds: Array.isArray(c.projectIds) ? c.projectIds : [],
                comments: Array.isArray(c.comments) ? c.comments : [],
                sites: Array.isArray(c.sites) ? c.sites : [],
                opportunities: Array.isArray(c.opportunities) ? c.opportunities : [],
                contracts: Array.isArray(c.contracts) ? c.contracts : [],
                activityLog: Array.isArray(c.activityLog) ? c.activityLog : [],
                billingTerms: typeof c.billingTerms === 'object' ? c.billingTerms : {
                    paymentTerms: 'Net 30',
                    billingFrequency: 'Monthly',
                    currency: 'ZAR',
                    retainerAmount: 0,
                    taxExempt: false,
                    notes: ''
                },
                createdAt: c.createdAt,
                updatedAt: c.updatedAt
            };
        };

        const subscriberId = 'clients-screen-live-sync';
        const handler = async (message) => {
            if (message?.type === 'data' && Array.isArray(message.data)) {
                if (message.dataType === 'clients') {
                    // Check if data changed to prevent unnecessary updates
                    const dataHash = JSON.stringify(message.data);
                    const now = Date.now();
                    
                    if (dataHash === lastLiveDataClientsHash && (now - lastLiveDataSyncTime) < LIVE_SYNC_THROTTLE) {
                        return;
                    }
                    
                    // Filter to only include actual clients (exclude leads and null types)
                    const processed = message.data.map(mapDbClient).filter(c => c.type === 'client');
                    
                    // Load opportunities for clients from LiveDataSync
                    if (window.api?.getOpportunitiesByClient) {
                        console.log(`📡 LiveDataSync: Loading opportunities for ${processed.length} clients...`);
                        const clientsWithOpportunities = await Promise.all(processed.map(async (client) => {
                            try {
                                const oppResponse = await window.api.getOpportunitiesByClient(client.id);
                                const opportunities = oppResponse?.data?.opportunities || [];
                                return { ...client, opportunities };
                            } catch (error) {
                                console.warn(`⚠️ LiveDataSync: Failed to load opportunities for ${client.id}:`, error);
                                return { ...client, opportunities: [] };
                            }
                        }));
                        const totalOpps = clientsWithOpportunities.reduce((sum, c) => sum + (c.opportunities?.length || 0), 0);
                        console.log(`✅ LiveDataSync: Loaded ${totalOpps} opportunities for ${clientsWithOpportunities.length} clients`);
                        setClients(clientsWithOpportunities);
                        safeStorage.setClients(clientsWithOpportunities);
                    } else {
                    setClients(processed);
                    safeStorage.setClients(processed);
                    }
                    
                    lastLiveDataClientsHash = dataHash;
                    lastLiveDataSyncTime = now;
                }
                if (message.dataType === 'leads') {
                    const processedLeads = message.data.map(mapDbClient).filter(c => (c.type || 'lead') === 'lead');
                    setLeads(processedLeads);
                    // Leads are database-only, no localStorage sync
                }
            }
        };

        try {
            if (window.storage?.getToken?.()) {
                window.LiveDataSync?.start?.();
            }
        } catch (_e) {}

        window.LiveDataSync?.subscribe?.(subscriberId, handler);
        return () => {
            window.LiveDataSync?.unsubscribe?.(subscriberId);
        };
    }, []);


    // Manual refresh/clear removed to ensure always-live data

    // Debug function to check client data consistency
    const debugClientData = () => {
        console.log('🔍 Client Data Debug Report:');
        console.log('Current clients state:', clients.length, 'clients');
        console.log('Clients:', clients.map(c => ({ id: c.id, name: c.name, ownerId: c.ownerId })));
        
        const localStorageClients = safeStorage.getClients();
        console.log('localStorage clients:', localStorageClients ? localStorageClients.length : 'none');
        if (localStorageClients) {
            console.log('localStorage clients:', localStorageClients.map(c => ({ id: c.id, name: c.name, ownerId: c.ownerId })));
        }
        
        const cachedClients = window.ClientCache?.getClients();
        console.log('Cached clients:', cachedClients ? cachedClients.length : 'none');
        if (cachedClients) {
            console.log('Cached clients:', cachedClients.map(c => ({ id: c.id, name: c.name, ownerId: c.ownerId })));
        }
        
        const currentUser = window.storage?.getUser?.();
        console.log('Current user:', currentUser);
        
        console.log('Cache status:', window.ClientCache?.getCacheStatus?.());
    };

    // Make debug function available globally
    window.debugClientData = debugClientData;

    // Function to load clients (can be called to refresh)
    const loadClients = async () => {
        console.log('🔄 Clients: loadClients() called');
        try {
            // IMMEDIATELY show cached data without waiting for API
            const cachedClients = safeStorage.getClients();
            
            if (cachedClients && cachedClients.length > 0) {
                // Filter cached data to ensure no leads or invalid types are included
                const filteredCachedClients = cachedClients.filter(client => 
                    client.type === 'client'
                );
                if (filteredCachedClients.length > 0) {
                    // Show cached clients IMMEDIATELY without waiting for opportunities (much faster!)
                    setClients(filteredCachedClients);
                    
                    // Only load opportunities in background if Pipeline view is active
                    if (viewMode === 'pipeline' && window.api?.getOpportunitiesByClient) {
                        Promise.all(filteredCachedClients.map(async (client) => {
                            try {
                                const oppResponse = await window.api.getOpportunitiesByClient(client.id);
                                return { client, opportunities: oppResponse?.data?.opportunities || [] };
                            } catch (error) {
                                return { client, opportunities: [] };
                            }
                        })).then(clientsWithOpps => {
                            const updated = filteredCachedClients.map(client => {
                                const found = clientsWithOpps.find(c => c.client.id === client.id);
                                return { ...client, opportunities: found?.opportunities || client.opportunities || [] };
                            });
                            setClients(updated);
                            safeStorage.setClients(updated);
                        });
                    }
                }
                // Log if any leads were filtered out from cache
                const filteredOut = cachedClients.length - filteredCachedClients.length;
                if (filteredOut > 0) {
                    console.log(`⚠️ Filtered out ${filteredOut} leads/invalid types from cached data`);
                }
            }
            
            // Check if user is logged in
            const token = window.storage?.getToken?.() || null;
            
            if (!token) {
                if (!cachedClients || cachedClients.length === 0) {
                    setClients([]);
                    safeStorage.setClients([]);
                }
                return;
            }
            
            // Skip API call if we recently called it AND we have data
            const now = Date.now();
            const timeSinceLastCall = now - lastApiCallTimestamp;
            
            if (timeSinceLastCall < API_CALL_INTERVAL && clients.length > 0) {
                console.log(`⚡ Skipping API call (${(timeSinceLastCall / 1000).toFixed(1)}s since last call)`);
                // Refresh opportunities in background without blocking
                if (window.api?.getOpportunitiesByClient) {
                    Promise.all(clients.map(async (client) => {
                        try {
                            const oppResponse = await window.api.getOpportunitiesByClient(client.id);
                            return { client, opportunities: oppResponse?.data?.opportunities || [] };
                        } catch (error) {
                            return { client, opportunities: [] };
                        }
                    })).then(clientsWithOpps => {
                        const updated = clients.map(client => {
                            const found = clientsWithOpps.find(c => c.client.id === client.id);
                            return { ...client, opportunities: found?.opportunities || client.opportunities || [] };
                        });
                        setClients(updated);
                        safeStorage.setClients(updated);
                    });
                }
                return; // Use cached data, skip API call
            }
            
            // Update last API call timestamp
            lastApiCallTimestamp = now;
            
            // API call happens in background after showing cached data
            try {
                const apiStartTime = performance.now();
                const res = await window.api.listClients();
                const apiEndTime = performance.now();
                console.log(`⚡ API call: ${(apiEndTime - apiStartTime).toFixed(1)}ms`);
                const apiClients = res?.data?.clients || [];
                console.log(`🔍 Raw API clients received: ${apiClients.length}`, apiClients);
                    
                    // If API returns no clients, use cached data
                    if (apiClients.length === 0 && cachedClients && cachedClients.length > 0) {
                        return; // Keep showing cached data
                    }
                    
                    // Use memoized data processor for better performance
                    const processStartTime = performance.now();
                    const processedClients = processClientData(apiClients);
                    console.log(`🔍 Processed clients: ${processedClients.length}`, processedClients);
                    
                    // Separate clients and leads based on type
                    // Explicitly filter: only include records with type='client' and exclude any with null/undefined type
                    const clientsOnly = processedClients.filter(c => c.type === 'client');
                    const leadsOnly = processedClients.filter(c => c.type === 'lead');
                    // Log any records with missing type for debugging
                    const missingType = processedClients.filter(c => !c.type || (c.type !== 'client' && c.type !== 'lead'));
                    if (missingType.length > 0) {
                        console.warn(`⚠️ Found ${missingType.length} records with invalid/missing type:`, missingType.map(c => ({ id: c.id, name: c.name, type: c.type })));
                    }
                    console.log(`🔍 Clients only: ${clientsOnly.length}, Leads only: ${leadsOnly.length}`);
                    
                    // Show clients and leads immediately (faster UX!)
                    setClients(clientsOnly);
                    setLeads(leadsOnly);
                    safeStorage.setClients(clientsOnly);
                    
                    // Only load opportunities in background when Pipeline is active
                    if (viewMode === 'pipeline' && window.api?.getOpportunitiesByClient) {
                        Promise.all(clientsOnly.map(async (client) => {
                            try {
                                const oppResponse = await window.api.getOpportunitiesByClient(client.id);
                                return { client, opportunities: oppResponse?.data?.opportunities || oppResponse?.opportunities || [] };
                            } catch (error) {
                                return { client, opportunities: [] };
                            }
                        })).then(clientsWithOpps => {
                            const updated = clientsOnly.map(client => {
                                const found = clientsWithOpps.find(c => c.client.id === client.id);
                                return { ...client, opportunities: found?.opportunities || [] };
                            });
                            const totalOpps = updated.reduce((sum, c) => sum + (c.opportunities?.length || 0), 0);
                            if (totalOpps > 0) {
                                console.log(`✅ Loaded ${totalOpps} opportunities for ${clientsOnly.length} clients`);
                            }
                            setClients(updated);
                            safeStorage.setClients(updated);
                        });
                    }
                    
                    const loadEndTime = performance.now();
                    console.log(`⚡ TOTAL loadClients: ${(loadEndTime - loadStartTime).toFixed(1)}ms`);
            } catch (apiError) {
                // On API error, just keep showing cached data
                if (apiError.message.includes('Unauthorized') || apiError.message.includes('401')) {
                    window.storage?.removeToken?.();
                    window.storage?.removeUser?.();
                }
            }
        } catch (e) {
            // On error, show cached data if available
            const fallbackClients = safeStorage.getClients();
            if (fallbackClients && fallbackClients.length > 0) {
                setClients(fallbackClients);
            }
        }
        // Projects are now handled by ProjectsDatabaseFirst component only
        // No localStorage persistence for projects
    };

    // Load leads from database only
    const loadLeads = async (forceRefresh = false) => {
        try {
            // Skip API call if we recently called it AND we have data (unless force refresh)
            if (!forceRefresh) {
                const now = Date.now();
                const timeSinceLastCall = now - lastLeadsApiCallTimestamp;
                
                if (timeSinceLastCall < API_CALL_INTERVAL && leads.length > 0) {
                    console.log(`⚡ Skipping Leads API call (${(timeSinceLastCall / 1000).toFixed(1)}s since last call)`);
                    return; // Use cached data, skip API call
                }
                lastLeadsApiCallTimestamp = now;
            } else {
                // Force refresh - clear all caches and bypass timestamp check
                console.log('🔄 FORCE REFRESH: Resetting API call timestamp to bypass cache');
                if (window.dataManager?.invalidate) {
                    window.dataManager.invalidate('leads');
                    console.log('🗑️ Cache invalidated for leads');
                }
                // Clear DatabaseAPI cache
                if (window.DatabaseAPI?.clearCache) {
                    window.DatabaseAPI.clearCache('/leads');
                }
                lastLeadsApiCallTimestamp = 0; // Reset to force API call
            }
            
            const token = window.storage?.getToken?.();
            const hasApi = window.api && typeof window.api.getLeads === 'function';
            
            // Skip if not authenticated or API not ready
            if (!token || !hasApi) {
                return;
            }
            
            // Update last API call timestamp if not force refresh
            if (!forceRefresh) {
                lastLeadsApiCallTimestamp = Date.now();
            }
            
            if (forceRefresh) {
                console.log('🔍 Loading leads from API... (FORCED REFRESH - bypassing all caches)');
            }
            
            const apiResponse = await window.api.getLeads(forceRefresh);
            const rawLeads = apiResponse?.data?.leads || apiResponse?.leads || [];
            
            // Map database fields to UI expected format with JSON parsing
            const mappedLeads = rawLeads.map(lead => {
                    
                    return {
                        id: lead.id,
                        name: lead.name || '',
                        industry: lead.industry || 'Other',
                        status: lead.status || 'Potential',
                        stage: lead.stage || 'Awareness',
                        source: lead.source || 'Website',
                        value: lead.value || lead.revenue || 0,
                        probability: lead.probability || 0,
                        firstContactDate: lead.firstContactDate || lead.createdAt ? new Date(lead.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                        lastContact: lead.lastContact || lead.updatedAt ? new Date(lead.updatedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                        address: lead.address || '',
                        website: lead.website || '',
                        notes: lead.notes || '',
                        contacts: typeof lead.contacts === 'string' ? JSON.parse(lead.contacts || '[]') : (lead.contacts || []),
                        followUps: typeof lead.followUps === 'string' ? JSON.parse(lead.followUps || '[]') : (lead.followUps || []),
                        projectIds: typeof lead.projectIds === 'string' ? JSON.parse(lead.projectIds || '[]') : (lead.projectIds || []),
                        comments: typeof lead.comments === 'string' ? JSON.parse(lead.comments || '[]') : (lead.comments || []),
                        activityLog: typeof lead.activityLog === 'string' ? JSON.parse(lead.activityLog || '[]') : (lead.activityLog || []),
                        sites: typeof lead.sites === 'string' ? JSON.parse(lead.sites || '[]') : (lead.sites || []),
                        contracts: typeof lead.contracts === 'string' ? JSON.parse(lead.contracts || '[]') : (lead.contracts || []),
                        billingTerms: typeof lead.billingTerms === 'string' ? JSON.parse(lead.billingTerms || '{}') : (lead.billingTerms || {
                            paymentTerms: 'Net 30',
                            billingFrequency: 'Monthly',
                            currency: 'ZAR',
                            retainerAmount: 0,
                            taxExempt: false,
                            notes: ''
                        }),
                        type: lead.type || 'lead',
                        ownerId: lead.ownerId || null,
                        createdAt: lead.createdAt,
                        updatedAt: lead.updatedAt
                    };
                });
                
            setLeads(mappedLeads);
            setLeadsCount(mappedLeads.length); // Update count badge immediately
            
            if (forceRefresh) {
                // Count leads by status for accurate reporting
                const statusCounts = mappedLeads.reduce((acc, lead) => {
                    acc[lead.status] = (acc[lead.status] || 0) + 1;
                    return acc;
                }, {});
                console.log(`✅ Force refresh complete: ${mappedLeads.length} total leads (${Object.entries(statusCounts).map(([status, count]) => `${count} ${status}`).join(', ')})`);
            }
        } catch (error) {
            // Keep existing leads on error, don't clear them
            console.error('❌ Error loading leads:', error);
        }
    };

    // Listen for storage changes to refresh clients (DISABLED - was causing infinite loop)
    // useEffect(() => {
    //     const handleStorageChange = () => {
    //         loadClients();
    //     };
    //     
    //     window.addEventListener('storage', handleStorageChange);
    //     // Also listen for custom events from other components
    //     window.addEventListener('clientsUpdated', handleStorageChange);
    //     
    //     return () => {
    //         window.removeEventListener('storage', handleStorageChange);
    //         window.removeEventListener('clientsUpdated', handleStorageChange);
    //     };
    // }, []);
    
    // Load opportunities when switching to pipeline view (debounced to avoid constant refreshing)
    useEffect(() => {
        if (viewMode !== 'pipeline') return;
        
        const loadOpportunitiesForClients = async () => {
            if (clients.length === 0 || !window.api?.getOpportunitiesByClient) return;
            
            // Check if any clients are missing opportunities
            const clientsNeedingOpps = clients.filter(c => !c.opportunities || c.opportunities.length === 0);
            if (clientsNeedingOpps.length === 0) return;
            
            const clientsWithOpportunities = await Promise.all(clients.map(async (client) => {
                try {
                    const oppResponse = await window.api.getOpportunitiesByClient(client.id);
                    const opportunities = oppResponse?.data?.opportunities || oppResponse?.opportunities || [];
                    return { ...client, opportunities };
                } catch (error) {
                    console.error(`❌ Pipeline: Failed to load opportunities for ${client.name}:`, error);
                    return { ...client, opportunities: client.opportunities || [] };
                }
            }));
            
            setClients(clientsWithOpportunities);
            safeStorage.setClients(clientsWithOpportunities);
        };
        
        // Debounce to prevent constant re-runs
        const timer = setTimeout(() => loadOpportunitiesForClients(), 300);
        return () => clearTimeout(timer);
    }, [viewMode]); // Only depend on viewMode, not clients.length
    
    // Save data
    useEffect(() => {
        safeStorage.setClients(clients);
    }, [clients]);
    
    // Leads are now database-only, no localStorage sync needed

    const handleUpdateClient = async (clientFormData, stayInEditMode = false) => {
        console.log('🔄 handleUpdateClient called');
        await handleSaveClient(clientFormData, stayInEditMode);
        
        // After saving, close the form and return to clients view
        if (!stayInEditMode) {
            setViewMode('clients');
            setSelectedClient(null);
            setCurrentTab('overview');
        }
    };
    
    const handleSaveClient = async (clientFormData, stayInEditMode = false) => {
        console.log('=== SAVE CLIENT DEBUG ===');
        console.log('Received form data:', clientFormData);
        console.log('All fields:', Object.keys(clientFormData));
        console.log('Contacts in form data:', clientFormData.contacts);
        console.log('Sites in form data:', clientFormData.sites);
        console.log('Selected client:', selectedClient);
        
        try {
            // Check if user is logged in
            const token = window.storage?.getToken?.() || null;
            
            // Create comprehensive client object with ALL fields
            const comprehensiveClient = {
                id: selectedClient ? selectedClient.id : Date.now().toString(),
                name: clientFormData.name || '',
                status: clientFormData.status || 'Active',
                industry: clientFormData.industry || 'Other',
                type: 'client',
                revenue: clientFormData.revenue || 0,
                lastContact: clientFormData.lastContact || new Date().toISOString().split('T')[0],
                address: clientFormData.address || '',
                website: clientFormData.website || '',
                notes: clientFormData.notes || '',
                contacts: clientFormData.contacts || [],
                followUps: clientFormData.followUps || [],
                projectIds: clientFormData.projectIds || [],
                comments: clientFormData.comments || [],
                sites: Array.isArray(clientFormData.sites) ? clientFormData.sites : [],
                opportunities: clientFormData.opportunities || [],
                contracts: clientFormData.contracts || [],
                activityLog: clientFormData.activityLog || [],
                billingTerms: clientFormData.billingTerms || {
                    paymentTerms: 'Net 30',
                    billingFrequency: 'Monthly',
                    currency: 'ZAR',
                    retainerAmount: 0,
                    taxExempt: false,
                    notes: ''
                }
            };
            
            console.log('📝 Comprehensive client created:', comprehensiveClient);
            console.log('📝 Contacts in comprehensive client:', comprehensiveClient.contacts);
            console.log('📝 Sites in comprehensive client:', comprehensiveClient.sites);
            console.log('📝 Opportunities in comprehensive client:', comprehensiveClient.opportunities);
            
            // Don't save to localStorage YET - wait for API to succeed
            // This ensures database is the source of truth
            console.log('Preparing to save client with all fields:', comprehensiveClient);
            
            if (!token) {
                // No token, save to localStorage only
                console.log('No token, saving to localStorage only');
                if (selectedClient) {
                    const updated = clients.map(c => c.id === selectedClient.id ? comprehensiveClient : c);
                    setClients(updated);
                    safeStorage.setClients(updated);
                    setSelectedClient(comprehensiveClient); // Update selectedClient to show new data immediately
                    console.log('✅ Updated client in localStorage, new count:', updated.length);
                } else {
                    const newClients = [...clients, comprehensiveClient];
                    setClients(newClients);
                    safeStorage.setClients(newClients);
                    console.log('✅ Added new client to localStorage, new count:', newClients.length);
                    
                    // For new clients, redirect to main clients view to show the newly added client
                    setViewMode('clients');
                    setSelectedClient(null);
                    setCurrentTab('overview');
                }
                } else {
                // Use API - database is source of truth
                try {
                    console.log('🔧 About to call API with selectedClient ID:', selectedClient?.id);
                    console.log('🔧 comprehensiveClient ID:', comprehensiveClient.id);
                    
                    if (selectedClient) {
                        // For updates, send ALL comprehensive data to API
                        const apiUpdateData = {
                            name: comprehensiveClient.name,
                            type: comprehensiveClient.type || 'client',
                            industry: comprehensiveClient.industry,
                            status: comprehensiveClient.status === 'Active' ? 'active' : 'inactive',
                            revenue: comprehensiveClient.revenue,
                            lastContact: comprehensiveClient.lastContact,
                            address: comprehensiveClient.address,
                            website: comprehensiveClient.website,
                            notes: comprehensiveClient.notes,
                            contacts: comprehensiveClient.contacts,
                            followUps: comprehensiveClient.followUps,
                            projectIds: comprehensiveClient.projectIds,
                            comments: comprehensiveClient.comments,
                            sites: comprehensiveClient.sites,
                            // opportunities field removed - conflicts with Prisma relation
                            contracts: comprehensiveClient.contracts,
                            activityLog: comprehensiveClient.activityLog,
                            billingTerms: comprehensiveClient.billingTerms
                        };
                        
                        console.log('🚀 Calling updateClient API with ID:', selectedClient.id);
                        console.log('📦 Update data payload:', JSON.stringify(apiUpdateData, null, 2));
                        try {
                            const apiResponse = await window.api.updateClient(selectedClient.id, apiUpdateData);
                            console.log('✅ Client updated via API with ALL data');
                            console.log('📥 API Response:', apiResponse);
                        } catch (apiCallError) {
                            console.error('❌ API call failed with error:', apiCallError);
                            console.error('Error details:', apiCallError.message);
                            throw apiCallError; // Re-throw to be caught by outer catch
                        }
                    } else {
                        // For new clients, send ALL comprehensive data to API
                        const apiCreateData = {
                            name: comprehensiveClient.name,
                            type: comprehensiveClient.type || 'client',
                            industry: comprehensiveClient.industry,
                            status: comprehensiveClient.status === 'Active' ? 'active' : 'inactive',
                            revenue: comprehensiveClient.revenue,
                            lastContact: comprehensiveClient.lastContact,
                            address: comprehensiveClient.address,
                            website: comprehensiveClient.website,
                            notes: comprehensiveClient.notes,
                            contacts: comprehensiveClient.contacts,
                            followUps: comprehensiveClient.followUps,
                            projectIds: comprehensiveClient.projectIds,
                            comments: comprehensiveClient.comments,
                            sites: comprehensiveClient.sites,
                            // opportunities field removed - conflicts with Prisma relation
                            contracts: comprehensiveClient.contracts,
                            activityLog: comprehensiveClient.activityLog,
                            billingTerms: comprehensiveClient.billingTerms
                        };
                        
                        console.log('🚀 Creating client via API:', apiCreateData);
                        const created = await window.api.createClient(apiCreateData);
                        console.log('✅ Client created via API:', created);
                        
                        // Update comprehensive client with API response
                        if (created?.data?.client?.id) {
                            comprehensiveClient.id = created.data.client.id;
                            console.log('✅ Updated client ID from API:', comprehensiveClient.id);
                        } else {
                            console.error('❌ No client ID in API response!');
                            console.log('Full API response:', created);
                        }
                    }
                    
                    // Always save comprehensive data to localStorage regardless of API success
                    console.log('Saving comprehensive data to localStorage after API success');
                    console.log('Current clients before localStorage save:', clients.length);
                    
                    if (selectedClient) {
                        const updated = clients.map(c => c.id === selectedClient.id ? comprehensiveClient : c);
                        console.log('Before API update - clients count:', clients.length, 'updated count:', updated.length);
                        if (updated.length !== clients.length) {
                            console.error('❌ CRITICAL: Client count changed during API update!');
                            console.log('Original clients:', clients);
                            console.log('Updated clients:', updated);
                            // Don't update if count changed
                            return;
                        }
                        setClients(updated);
                        safeStorage.setClients(updated);
                        setSelectedClient(comprehensiveClient); // Update selectedClient to show new data
                        console.log('✅ Updated client in localStorage after API success, new count:', updated.length);
                    } else {
                        const newClients = [...clients, comprehensiveClient];
                        console.log('Before API add - clients count:', clients.length, 'new count:', newClients.length);
                        if (newClients.length !== clients.length + 1) {
                            console.error('❌ CRITICAL: Client count not increased by 1 during API add!');
                            console.log('Original clients:', clients);
                            console.log('New clients:', newClients);
                            // Don't update if count is wrong
                            return;
                        }
                        setClients(newClients);
                        safeStorage.setClients(newClients);
                        setSelectedClient(comprehensiveClient); // Update selectedClient to show new data
                        console.log('✅ Added new client to localStorage after API success, new count:', newClients.length);
                    }
                    console.log('✅ Comprehensive client data saved to localStorage');
                    
                } catch (apiError) {
                    console.error('API error saving client:', apiError);
                    if (apiError.message.includes('Unauthorized') || apiError.message.includes('401')) {
                        console.log('Token expired, falling back to localStorage only');
                        window.storage?.removeToken?.();
                        window.storage?.removeUser?.();
                    }
                    
                    // Always fall back to localStorage on any API error
                    console.log('Falling back to localStorage for client save');
                    console.log('Current clients before fallback:', clients.length);
                    console.log('Comprehensive client to save:', comprehensiveClient);
                    
                    if (selectedClient) {
                        const updated = clients.map(c => c.id === selectedClient.id ? comprehensiveClient : c);
                        setClients(updated);
                        safeStorage.setClients(updated);
                        setSelectedClient(comprehensiveClient); // Update selectedClient to show new data
                        console.log('✅ Updated client in localStorage, new count:', updated.length);
                    } else {
                        const newClients = [...clients, comprehensiveClient];
                        setClients(newClients);
                        safeStorage.setClients(newClients);
                        setSelectedClient(comprehensiveClient); // Update selectedClient to show new data
                        console.log('✅ Added new client to localStorage, new count:', newClients.length);
                    }
                    console.log('✅ Fallback: Client saved to localStorage only');
                }
            }
            
            // Silent save - no alert, just refresh and stay in view
            
        } catch (error) {
            console.error('Failed to save client:', error);
            alert('Failed to save client: ' + error.message);
        }
        
        if (!stayInEditMode) {
            setRefreshKey(k => k + 1);
        }
    };
    
    const handleSaveLead = async (leadFormData) => {
        console.log('=== SAVE LEAD DEBUG ===');
        console.log('Received lead data:', leadFormData);
        console.log('Lead status from form:', leadFormData.status);
        console.log('Lead stage from form:', leadFormData.stage);
        
        try {
            const token = window.storage?.getToken?.();
            
            if (selectedLead) {
                // Update existing lead with ALL fields from form data
                const updatedLead = { 
                    ...selectedLead, 
                    ...leadFormData,
                    // Ensure critical fields are preserved
                    status: leadFormData.status,
                    stage: leadFormData.stage
                };
                
                console.log('🔄 Updated lead object:', { id: updatedLead.id, status: updatedLead.status, stage: updatedLead.stage });
                
                // Update local state immediately for responsive UI
                const updatedLeads = leads.map(l => l.id === selectedLead.id ? updatedLead : l);
                setLeads(updatedLeads);
                setSelectedLead(updatedLead); // Update selected lead immediately
                
                if (token && window.api?.updateLead) {
                    try {
                        console.log('🌐 Calling API to update lead:', updatedLead.id);
                        console.log('🌐 Payload to API:', { status: updatedLead.status, stage: updatedLead.stage });
                        
                        const apiResponse = await window.api.updateLead(updatedLead.id, updatedLead);
                        console.log('✅ Lead updated in database');
                        console.log('✅ API response:', apiResponse);
                        
                        // Refresh leads from database to ensure consistency (FORCE refresh to bypass cache)
                        setTimeout(() => {
                        loadLeads(true); // Force refresh to bypass API throttling
                        }, 500);
                    } catch (apiError) {
                        console.error('❌ API error updating lead:', apiError);
                        // Local update already applied
                    }
                } else {
                    console.log('✅ Lead updated locally (no authentication)');
                }
                console.log('✅ Lead updated');
            } else {
                // Create new lead
                // Get current user info
                const user = window.storage?.getUser?.() || {};
                const currentUser = {
                    name: user?.name || 'System',
                    email: user?.email || 'system',
                    id: user?.id || 'system'
                };
                
                const newLead = {
                    ...leadFormData,
                    id: Date.now().toString(), // Generate local ID
                    type: 'lead', // Ensure it's marked as a lead
                    lastContact: new Date().toISOString().split('T')[0],
                    activityLog: [{
                        id: Date.now(),
                        type: 'Lead Created',
                        description: `Lead created: ${leadFormData.name}`,
                        timestamp: new Date().toISOString(),
                        user: currentUser.name,
                        userId: currentUser.id,
                        userEmail: currentUser.email
                    }]
                };
                
                if (token && window.api?.createLead) {
                    try {
                        console.log('🌐 Calling API to create lead:', newLead);
                        const apiResponse = await window.api.createLead(newLead);
                        const savedLead = apiResponse?.data?.lead || apiResponse?.lead || apiResponse;
                        console.log('✅ Lead created in database:', savedLead);
                        
                        // Use the saved lead from database (with proper ID)
                        if (savedLead && savedLead.id) {
                            const updatedLeads = [...leads, savedLead];
                            setLeads(updatedLeads);
                            console.log('✅ New lead created and saved to database');
                        } else {
                            // Fallback to local lead if API doesn't return proper response
                            const updatedLeads = [...leads, newLead];
                            setLeads(updatedLeads);
                            console.log('✅ New lead created locally (API fallback)');
                        }
                    } catch (apiError) {
                        console.error('❌ API error creating lead:', apiError);
                        // Fallback to local creation
                        const updatedLeads = [...leads, newLead];
                        setLeads(updatedLeads);
                        console.log('✅ New lead created locally (API fallback)');
                    }
                } else {
                    // No token or API, create locally only
                    const updatedLeads = [...leads, newLead];
                    setLeads(updatedLeads);
                    console.log('✅ New lead created locally (no authentication)');
                }
                
                // For new leads, redirect to main leads view to show the newly added lead
                setViewMode('leads');
                setSelectedLead(null);
                setCurrentLeadTab('overview');
                
                // Force a refresh to ensure API data is loaded (if authenticated)
                if (token) {
                    setTimeout(() => {
                        console.log('🔄 Refreshing leads after creation...');
                        loadLeads(true); // Force refresh to bypass API throttling
                    }, 100);
                }
            }
        } catch (error) {
            console.error('❌ Error saving lead:', error);
            alert('Failed to save lead: ' + error.message);
        }
    };

    const handleDeleteClient = async (clientId) => {
        try {
            // Try to delete from database first
            const token = window.storage?.getToken?.();
            if (token && window.api?.deleteClient) {
                try {
                    await window.api.deleteClient(clientId);
                    console.log('✅ Client deleted from database');
                } catch (error) {
                    console.warn('⚠️ Failed to delete client from database:', error);
                }
            }
            
            // Update local state and localStorage
            const updatedClients = clients.filter(c => c.id !== clientId);
            setClients(updatedClients);
            safeStorage.setClients(updatedClients);
            console.log('✅ Client deleted from localStorage');
        } catch (error) {
            console.error('❌ Error deleting client:', error);
        }
    };

    const handleDeleteLead = async (leadId) => {
        try {
            console.log('🗑️ Deleting lead:', leadId);
            console.log('Current leads before deletion:', leads.length);
            
            const token = window.storage?.getToken?.();
            
            if (token && window.api?.deleteLead) {
                try {
                    // Delete from database
                    await window.api.deleteLead(leadId);
                    console.log('✅ Lead deleted from database');
                } catch (apiError) {
                    console.error('❌ API error deleting lead:', apiError);
                    // Continue with local deletion even if API fails
                }
            } else {
                console.log('⚠️ No authentication token or API available, deleting locally only');
            }
            
            // Update local state
            const updatedLeads = leads.filter(l => l.id !== leadId);
            setLeads(updatedLeads);
            console.log('✅ Lead deleted, new count:', updatedLeads.length);
            
            // Force a refresh to ensure API data is loaded (if authenticated)
            if (token) {
                setTimeout(() => {
                    console.log('🔄 Refreshing leads after deletion...');
                    loadLeads(true); // Force refresh to bypass API throttling
                }, 100);
            }
            
        } catch (error) {
            console.error('❌ Error deleting lead:', error);
            alert('Failed to delete lead: ' + error.message);
        }
    };

    // Handle column sorting
    const handleSort = (field) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    // Sort function
    const sortClients = (clients) => {
        return [...clients].sort((a, b) => {
            let aValue = a[sortField];
            let bValue = b[sortField];
            
            // Handle nested fields like contact name
            if (sortField === 'contact') {
                aValue = a.contacts?.[0]?.name || '';
                bValue = b.contacts?.[0]?.name || '';
            }
            
            // Handle date fields
            if (sortField === 'lastContact') {
                aValue = new Date(aValue || 0);
                bValue = new Date(bValue || 0);
            }
            
            // Convert to strings for comparison
            if (typeof aValue === 'string') aValue = aValue.toLowerCase();
            if (typeof bValue === 'string') bValue = bValue.toLowerCase();
            
            if (sortDirection === 'asc') {
                return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
            } else {
                return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
            }
        });
    };

    // Filter clients - explicitly exclude leads and records without proper type
    // Use multiple checks to ensure leads never appear in clients list
    const filteredClients = clients.filter(client => {
        // STRICT: Only include if type is explicitly 'client'
        if (client.type !== 'client') {
            return false; // Exclude leads, null types, undefined, or any other value
        }
        
        // Additional safeguard: exclude records with status='Potential' (always a lead)
        // This catches leads that might have been incorrectly saved with type='client'
        if (client.status === 'Potential') {
            console.warn(`⚠️ Filtering out lead with status='Potential' from clients: ${client.name}`);
            return false;
        }
        
        // Enhanced search across multiple fields
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = searchTerm === '' || 
            client.name.toLowerCase().includes(searchLower) ||
            client.industry.toLowerCase().includes(searchLower) ||
            client.address.toLowerCase().includes(searchLower) ||
            client.website.toLowerCase().includes(searchLower) ||
            client.notes.toLowerCase().includes(searchLower) ||
            // Search in all contacts
            (client.contacts || []).some(contact => 
                contact.name.toLowerCase().includes(searchLower) ||
                contact.email.toLowerCase().includes(searchLower) ||
                contact.phone.includes(searchTerm)
            ) ||
            // Search in all sites
            (client.sites || []).some(site => 
                site.name.toLowerCase().includes(searchLower) ||
                site.address.toLowerCase().includes(searchLower)
            );
        
        const matchesIndustry = filterIndustry === 'All Industries' || client.industry === filterIndustry;
        const matchesStatus = filterStatus === 'All Status' || client.status === filterStatus;
        
        return matchesSearch && matchesIndustry && matchesStatus;
    });

    // Sort the filtered clients
    const sortedClients = sortClients(filteredClients);

    // Filter leads
    const filteredLeads = leads.filter(lead => {
        const matchesSearch = searchTerm === '' || 
            lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (lead.contacts?.[0]?.name?.toLowerCase() || '').includes(searchTerm.toLowerCase());
        
        const matchesIndustry = filterIndustry === 'All Industries' || lead.industry === filterIndustry;
        // Status is hardcoded as 'active' for all leads, so status filter doesn't apply
        const matchesStatus = true;
        
        return matchesSearch && matchesIndustry && matchesStatus;
    });

    const pipelineStages = ['Awareness', 'Interest', 'Desire', 'Action'];

    const handleOpenClient = (client) => {
        setSelectedClient(client);
        setSelectedLead(null);
        setViewMode('client-detail');
    };

    const handleOpenLead = (lead) => {
        setSelectedLead(lead);
        setSelectedClient(null);
        setViewMode('lead-detail'); // Open in full detail view like clients
    };

    const handleNavigateToProject = (projectId) => {
        sessionStorage.setItem('openProjectId', projectId);
        setViewMode('clients');
        setSelectedClient(null);
        window.dispatchEvent(new CustomEvent('navigateToPage', { 
            detail: { page: 'projects', projectId } 
        }));
    };

    const convertLeadToClient = (lead) => {
        const newClient = {
            id: Math.max(0, ...clients.map(c => c.id)) + 1,
            name: lead.name,
            industry: lead.industry,
            status: 'Active',
            type: 'client',
            revenue: 0,
            lastContact: new Date().toISOString().split('T')[0],
            address: '',
            website: '',
            notes: lead.notes,
            contacts: lead.contacts || [],
            followUps: lead.followUps || [],
            projectIds: lead.projectIds || [],
            comments: lead.comments || [],
            sites: [],
            opportunities: [],
            activityLog: [{
                id: Date.now(),
                type: 'Lead Converted',
                description: `Converted from lead to client`,
                timestamp: new Date().toISOString(),
                user: (() => {
                    const u = window.storage?.getUser?.() || {};
                    return u.name || 'System';
                })(),
                userId: (() => {
                    const u = window.storage?.getUser?.() || {};
                    return u.id || 'system';
                })(),
                userEmail: (() => {
                    const u = window.storage?.getUser?.() || {};
                    return u.email || 'system';
                })()
            }]
        };
        setClients([...clients, newClient]);
        setLeads(leads.filter(l => l.id !== lead.id));
        setViewMode('clients');
        setSelectedLead(null);
        alert('Lead converted to client!');
    };

    // Pipeline View Component
    const PipelineView = () => {
        const [draggedItem, setDraggedItem] = useState(null);
        const [draggedType, setDraggedType] = useState(null);
        const [didDrag, setDidDrag] = useState(false);
        
        // Listen for opportunity updates from ClientDetailModal
        useEffect(() => {
            const handleOpportunitiesUpdated = async (event) => {
                if (!window.api?.getOpportunitiesByClient) return;
                
                // Reload opportunities for all clients to ensure Pipeline view is up-to-date
                const clientsWithOpps = await Promise.all(clients.map(async (client) => {
                    try {
                        const oppResponse = await window.api.getOpportunitiesByClient(client.id);
                        const opps = oppResponse?.data?.opportunities || oppResponse?.opportunities || [];
                        return { ...client, opportunities: opps };
                    } catch (error) {
                        console.error(`❌ Failed to reload opportunities for ${client.name}:`, error);
                        return { ...client, opportunities: client.opportunities || [] };
                    }
                }));
                setClients(clientsWithOpps);
                safeStorage.setClients(clientsWithOpps);
            };
            
            window.addEventListener('opportunitiesUpdated', handleOpportunitiesUpdated);
            return () => window.removeEventListener('opportunitiesUpdated', handleOpportunitiesUpdated);
        }, [clients]);
        
        let clientOpportunities = clients.reduce((acc, client) => {
            if (client.opportunities && Array.isArray(client.opportunities)) {
                const mapped = client.opportunities.map(opp => {
                    // Normalize stage to match pipeline stages exactly
                    let normalizedStage = 'Awareness'; // Default
                    const originalStage = opp.stage;
                    
                    if (originalStage && typeof originalStage === 'string') {
                        // Convert to title case and match to pipeline stages
                        const stageMap = {
                            'awareness': 'Awareness',
                            'interest': 'Interest',
                            'desire': 'Desire',
                            'action': 'Action',
                            'prospect': 'Awareness',
                            'new': 'Awareness',
                            'qualification': 'Interest',
                            'proposal': 'Desire',
                            'negotiation': 'Action'
                        };
                        normalizedStage = stageMap[originalStage.toLowerCase()] || 'Awareness';
                    }
                    
                    
                    return {
                    ...opp,
                    clientName: client.name,
                    clientId: client.id,
                    type: 'opportunity',
                        stage: normalizedStage, // Use normalized stage
                        status: opp.status || 'Active', // Default to Active if no status
                        title: opp.title || opp.name || 'Untitled Opportunity',
                        value: Number(opp.value) || 0
                    };
                });
                if (mapped.length > 0) {
                }
                return acc.concat(mapped);
            }
            return acc;
        }, []);
        

        // Filter active leads and assign default stage if missing
        const activeLeads = leads.map(lead => {
            // Assign default stage if missing
            if (!lead.stage) {
                return { ...lead, stage: 'Awareness' };
            }
            return lead;
        }).filter(lead => {
            // Filter out inactive leads
            return lead.status !== 'Inactive' && lead.status !== 'Disinterested';
        });
        
        // Filter active opportunities
        const activeOpportunities = clientOpportunities.filter(opp => {
            const status = opp.status || 'Active'; // Default to 'Active' if no status
            return status !== 'Inactive' && status !== 'Closed Lost' && status !== 'Closed Won';
        });

        const handleDragStart = (item, type) => {
            setDidDrag(true);
            setDraggedItem(item);
            setDraggedType(type);
        };

        const handleDragOver = (e) => {
            e.preventDefault();
        };

        const handleDrop = (e, targetStage) => {
            e.preventDefault();
            
            if (!draggedItem || !draggedType || draggedItem.stage === targetStage) {
                setDraggedItem(null);
                setDraggedType(null);
                return;
            }

            if (draggedType === 'lead') {
                const updatedLeads = leads.map(lead => 
                    lead.id === draggedItem.id ? { ...lead, stage: targetStage } : lead
                );
                setLeads(updatedLeads);
                
                // Save to API
                const token = window.storage?.getToken?.();
                if (token && window.DatabaseAPI) {
                    window.DatabaseAPI.updateLead(draggedItem.id, { stage: targetStage })
                        .catch(err => console.error('❌ Failed to update lead stage:', err));
                }
            } else if (draggedType === 'opportunity') {
                const updatedClients = clients.map(client => {
                    if (client.id === draggedItem.clientId) {
                        const updatedOpportunities = client.opportunities.map(opp =>
                            opp.id === draggedItem.id ? { ...opp, stage: targetStage } : opp
                        );
                        return { ...client, opportunities: updatedOpportunities };
                    }
                    return client;
                });
                setClients(updatedClients);
                safeStorage.setClients(updatedClients);
                
                // Save opportunity update to API if opportunity has an ID
                const token = window.storage?.getToken?.();
                if (token && window.api && window.api.updateOpportunity && draggedItem.id) {
                    window.api.updateOpportunity(draggedItem.id, { stage: targetStage })
                        .catch(err => {
                            console.error('❌ Failed to update opportunity stage via API:', err);
                        });
                }
            }

            setDraggedItem(null);
            setDraggedType(null);
            // Small delay to distinguish drag from click
            setTimeout(() => setDidDrag(false), 50);
            // No need to trigger full reload - state already updated and API call made
        };

        const handleDragEnd = () => {
            setDraggedItem(null);
            setDraggedType(null);
        };

        return (
            <div className="space-y-6">
                {/* Stats */}
                <div className="grid grid-cols-4 gap-4">
                    <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-4`}>
                        <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Active Leads</div>
                        <div className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{activeLeads.length}</div>
                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-1`}>New prospects</div>
                    </div>
                    <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-4`}>
                        <div className="flex items-center justify-between mb-1">
                            <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Active Opportunities</div>
                            <button
                                onClick={async () => {
                                    if (window.api?.getOpportunitiesByClient) {
                                        const clientsWithOpps = await Promise.all(clients.map(async (client) => {
                                            try {
                                                const oppResponse = await window.api.getOpportunitiesByClient(client.id);
                                                const opps = oppResponse?.data?.opportunities || oppResponse?.opportunities || [];
                                                return { ...client, opportunities: opps };
                                            } catch (error) {
                                                console.error(`❌ Failed to refresh opportunities for ${client.name}:`, error);
                                                return { ...client, opportunities: client.opportunities || [] };
                                            }
                                        }));
                                        setClients(clientsWithOpps);
                                        safeStorage.setClients(clientsWithOpps);
                                    }
                                }}
                                className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
                                title="Refresh opportunities"
                            >
                                <i className="fas fa-sync-alt"></i> Refresh
                            </button>
                        </div>
                        <div className="text-2xl font-bold text-primary-600">{activeOpportunities.length}</div>
                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-1`}>Client expansions</div>
                    </div>
                    <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-4`}>
                        <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Pipeline Value</div>
                        <div className="text-2xl font-bold text-green-600">
                            R {(activeLeads.reduce((sum, lead) => sum + (lead.value || 0), 0) + activeOpportunities.reduce((sum, opp) => sum + (opp.value || 0), 0)).toLocaleString('en-ZA')}
                        </div>
                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-1`}>Total potential</div>
                    </div>
                    <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-4 flex items-center justify-between`}>
                        <div>
                            <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Conversion Rate</div>
                            <div className="text-2xl font-bold text-purple-600">
                                {activeLeads.length > 0 ? Math.round((activeLeads.filter(l => l.stage === 'Action').length / activeLeads.length) * 100) : 0}%
                            </div>
                            <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-1`}>To action stage</div>
                        </div>
                    </div>
                </div>

                {/* Enhanced Pipeline Board */}
                <div className="flex gap-6 overflow-x-auto pb-6">
                    {pipelineStages.map(stage => {
                        const stageLeads = activeLeads.filter(lead => lead.stage === stage);
                        const stageOpps = activeOpportunities.filter(opp => opp.stage === stage);
                        const stageCount = stageLeads.length + stageOpps.length;
                        const isDraggedOver = draggedItem && draggedItem.stage !== stage;
                        
                        const stageIcons = {
                            'Awareness': 'fa-eye',
                            'Interest': 'fa-search',
                            'Desire': 'fa-heart',
                            'Action': 'fa-rocket'
                        };

                        const stageColors = {
                            'Awareness': 'from-gray-500 to-gray-600',
                            'Interest': 'from-blue-500 to-blue-600',
                            'Desire': 'from-yellow-500 to-yellow-600',
                            'Action': 'from-green-500 to-green-600'
                        };
                        
                        return (
                            <div 
                                key={stage} 
                                className={`flex-1 min-w-[320px] ${isDark ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-lg border transition-all duration-300 ${
                                    isDark ? 'border-gray-700' : 'border-gray-200'
                                } ${
                                    isDraggedOver ? `ring-2 ring-primary-500 ${isDark ? 'bg-primary-900' : 'bg-primary-50'} transform scale-105` : 'hover:shadow-xl'
                                }`}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, stage)}
                            >
                                {/* Stage Header with Gradient */}
                                <div className={`bg-gradient-to-r ${stageColors[stage]} rounded-t-xl p-4 mb-4 -mx-1 -mt-1`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                                                <i className={`fas ${stageIcons[stage]} text-white text-sm`}></i>
                                            </div>
                                            <div>
                                                <h3 className="text-white font-semibold text-lg">{stage}</h3>
                                                <p className="text-white/80 text-sm">{stageCount} items</p>
                                            </div>
                                        </div>
                                        <span className={`px-2 py-1 ${isDark ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'} rounded-full text-xs font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'} border`}>
                                            {stageLeads.length + stageOpps.length}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    {stageLeads.length === 0 && stageOpps.length === 0 && (
                                        <div className={`text-center py-12 rounded-xl border-2 border-dashed transition-all duration-300 ${
                                            isDraggedOver ? `border-primary-400 ${isDark ? 'bg-primary-900' : 'bg-primary-50'} scale-105` : `${isDark ? 'border-gray-600 hover:border-gray-500' : 'border-gray-300 hover:border-gray-400'}`
                                        }`}>
                                            <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                                                <i className="fas fa-plus text-2xl text-gray-400"></i>
                                            </div>
                                            <p className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-1`}>No items yet</p>
                                            <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Drag items here or add new ones</p>
                                        </div>
                                    )}
                                    
                                    {stageLeads.map(lead => (
                                        <div 
                                            key={`lead-${lead.id}-${stage}-${lead.name}`}
                                            draggable
                                            onDragStart={() => handleDragStart(lead, 'lead')}
                                            onDragEnd={handleDragEnd}
                                            onClick={() => handleOpenLead(lead)}
                                            className={`${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-white hover:bg-gray-50'} rounded-xl p-4 border transition-all duration-300 cursor-move group ${
                                                isDark ? 'border-gray-600 hover:border-gray-500' : 'border-gray-200 hover:border-gray-300'
                                            } ${
                                                draggedItem?.id === lead.id ? 'opacity-50 transform scale-95' : 'hover:shadow-lg hover:-translate-y-1'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-3 mb-3">
                                                <div className="flex-1">
                                                    <h4 className={`font-semibold text-sm ${isDark ? 'text-gray-100' : 'text-gray-900'} line-clamp-2 mb-1 ${isDark ? 'group-hover:text-primary-400' : 'group-hover:text-primary-600'} transition-colors`}>{lead.name}</h4>
                                                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{lead.industry}</p>
                                            </div>
                                                <span className="px-3 py-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-xs rounded-full font-medium shrink-0 shadow-sm">LEAD</span>
                                            </div>
                                            <div className="flex items-center gap-2 mb-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isDark ? 'bg-gray-600' : 'bg-gray-100'}`}>
                                                    <i className="fas fa-user text-xs text-gray-500"></i>
                                                </div>
                                                <div className="flex-1">
                                                    <p className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{lead.contacts?.[0]?.name || 'No contact'}</p>
                                                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{lead.contacts?.[0]?.email || 'No email'}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{lead.status}</span>
                                            </div>
                                        </div>
                                    ))}
                                    
                                    {stageOpps.map((opp, idx) => {
                                        const client = clients.find(c => c.id === opp.clientId);
                                        return (
                                            <div 
                                                key={`opp-${opp.id}-${idx}`}
                                                draggable
                                                onDragStart={() => handleDragStart(opp, 'opportunity')}
                                                onDragEnd={handleDragEnd}
                                                onClick={(e) => {
                                                    if (didDrag) {
                                                        e.preventDefault();
                                                        return;
                                                    }
                                                    handleOpenClient(client);
                                                }}
                                                className={`${isDark ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'} rounded-lg p-3 border shadow-sm hover:shadow-md cursor-move transition ${
                                                    draggedItem?.id === opp.id ? 'opacity-50' : ''
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-2 mb-2">
                                                    <div className={`font-medium text-sm ${isDark ? 'text-gray-100' : 'text-gray-900'} line-clamp-2 flex-1`}>{opp.title || opp.name || 'Untitled Opportunity'}</div>
                                                    <span className={`px-2 py-0.5 ${isDark ? 'bg-green-900 text-green-200' : 'bg-green-100 text-green-700'} text-xs rounded-full font-medium shrink-0`}>OPP</span>
                                                </div>
                                                <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-2`}>
                                                    <i className="fas fa-building mr-1"></i>
                                                    {opp.clientName}
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Existing client</span>
                                                    {opp.value > 0 && (
                                                        <span className={`text-xs font-medium ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                                                            R {opp.value.toLocaleString('en-ZA')}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // Clients List View
    const ClientsListView = () => (
        <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border`}>
            <div className="overflow-x-auto">
                <table className={`min-w-full divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`}>
                    <thead className={isDark ? 'bg-gray-700' : 'bg-gray-50'}>
                        <tr>
                            <th 
                                className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                                onClick={() => handleSort('name')}
                            >
                                <div className="flex items-center">
                                    Client
                                    {sortField === 'name' && (
                                        <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ml-1 text-xs`}></i>
                                    )}
                                </div>
                            </th>
                            <th 
                                className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                                onClick={() => handleSort('contact')}
                            >
                                <div className="flex items-center">
                                    Contact
                                    {sortField === 'contact' && (
                                        <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ml-1 text-xs`}></i>
                                    )}
                                </div>
                            </th>
                            <th 
                                className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                                onClick={() => handleSort('industry')}
                            >
                                <div className="flex items-center">
                                    Industry
                                    {sortField === 'industry' && (
                                        <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ml-1 text-xs`}></i>
                                    )}
                                </div>
                            </th>
                            <th 
                                className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                                onClick={() => handleSort('status')}
                            >
                                <div className="flex items-center">
                                    Status
                                    {sortField === 'status' && (
                                        <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ml-1 text-xs`}></i>
                                    )}
                                </div>
                            </th>
                            <th 
                                className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                                onClick={() => handleSort('lastContact')}
                            >
                                <div className="flex items-center">
                                    Last Contact
                                    {sortField === 'lastContact' && (
                                        <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ml-1 text-xs`}></i>
                                    )}
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody className={`${isDark ? 'bg-gray-800 divide-gray-700' : 'bg-white divide-gray-200'} divide-y`}>
                        {sortedClients.length === 0 ? (
                            <tr>
                                    <td colSpan="5" className={`px-6 py-8 text-center text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                        <i className={`fas fa-inbox text-3xl ${isDark ? 'text-gray-600' : 'text-gray-300'} mb-2`}></i>
                                    <p>No clients found</p>
                                </td>
                            </tr>
                        ) : (
                            sortedClients.filter(client => {
                                // Final render-time safety check: ensure type is 'client' and not 'Potential' status
                                return client.type === 'client' && client.status !== 'Potential';
                            }).map(client => (
                                <tr 
                                    key={client.id} 
                                    onClick={() => handleOpenClient(client)}
                                        className={`${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'} cursor-pointer transition`}
                                >
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className={`text-sm font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{client.name}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className={`text-sm ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>{client.contacts?.[0]?.name || 'No contact'}</div>
                                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{client.contacts?.[0]?.email || ''}</div>
                                    </td>
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>{client.industry}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                            (client.status === 'Active' || client.status === 'active') ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                        }`}>
                                            {client.status === 'active' ? 'Active' : client.status}
                                        </span>
                                    </td>
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{client.lastContact}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    // Leads List View
    // Note: Lead status is now hardcoded as 'active' - removed handleLeadStatusChange function

    const LeadsListView = () => (
        <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border`}>
            <div className="overflow-x-auto">
                <table className={`min-w-full divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`}>
                    <thead className={isDark ? 'bg-gray-700' : 'bg-gray-50'}>
                        <tr>
                            <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>Lead</th>
                            <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>Contact</th>
                            <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>Industry</th>
                            <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>Stage</th>
                            <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>Status</th>
                            <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>Time Since Contact</th>
                        </tr>
                    </thead>
                    <tbody className={`${isDark ? 'bg-gray-800 divide-gray-700' : 'bg-white divide-gray-200'} divide-y`}>
                        {filteredLeads.length === 0 ? (
                            <tr>
                                <td colSpan="6" className={`px-6 py-12 text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                    <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                                        <i className="fas fa-user-plus text-2xl text-gray-400"></i>
                                    </div>
                                    <p className="text-lg font-medium mb-2">No leads found</p>
                                    <p className="text-sm">Get started by adding your first lead</p>
                                </td>
                            </tr>
                        ) : (
                            filteredLeads.map(lead => (
                                <tr 
                                    key={`lead-${lead.id}-${lead.name}`}
                                    onClick={() => handleOpenLead(lead)}
                                        className={`${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'} cursor-pointer transition`}
                                >
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className={`text-sm font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{lead.name}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className={`text-sm ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{lead.contacts?.[0]?.name || 'No contact'}</div>
                                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{lead.contacts?.[0]?.email || ''}</div>
                                    </td>
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{lead.industry}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                                            lead.stage === 'Awareness' ? (isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-800') :
                                            lead.stage === 'Interest' ? (isDark ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-800') :
                                            lead.stage === 'Desire' ? (isDark ? 'bg-yellow-900 text-yellow-200' : 'bg-yellow-100 text-yellow-800') :
                                            (isDark ? 'bg-green-900 text-green-200' : 'bg-green-100 text-green-800')
                                        }`}>
                                            {lead.stage}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 text-xs font-medium rounded ${isDark ? 'bg-green-900 text-green-200' : 'bg-green-100 text-green-700'}`}>
                                            Active
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className={`text-sm ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                                            {getTimeSinceFirstContact(lead.firstContactDate)}
                                        </div>
                                        {lead.firstContactDate && (
                                            <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                {new Date(lead.firstContactDate).toLocaleDateString()}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    // Full-page Client Detail View
    const ClientDetailView = () => (
        <div className={`min-h-screen ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
            {/* Header with breadcrumb */}
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b px-6 py-4`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <button 
                            onClick={() => {
                                setViewMode('clients');
                                setSelectedClient(null);
                            }}
                            className={`${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'} flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200`}
                            title="Go back"
                        >
                            <i className="fas fa-arrow-left"></i>
                        </button>
                        <div className="flex items-center space-x-3">
                            <div className={`w-2 h-2 rounded-full ${isDark ? 'bg-primary-400' : 'bg-primary-600'}`}></div>
                            <h1 className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                {selectedClient ? selectedClient.name : 'New Client'}
                            </h1>
                        </div>
                    </div>
                    {/* Edit mode removed - always allow editing */}
                </div>
            </div>

            {/* Full-page client detail content */}
            <div className="p-6">
                {(() => {
                    const Modal = window.ClientDetailModal;
                    return Modal ? (
                        <Modal
                        client={selectedClient}
                        onSave={handleSaveClient}
                        onUpdate={handleUpdateClient}
                        onClose={() => {
                            setViewMode('clients');
                            setSelectedClient(null);
                            setCurrentTab('overview');
                        }}
                        onDelete={handleDeleteClient}
                        allProjects={projects}
                        onNavigateToProject={handleNavigateToProject}
                        isFullPage={true}
                        isEditing={true}
                        hideSearchFilters={true}
                        initialTab={currentTab}
                        onTabChange={setCurrentTab}
                    />
                    ) : (
                        <div className="text-center py-8 text-gray-500">
                            <i className="fas fa-exclamation-triangle text-3xl mb-2"></i>
                            <p>ClientDetailModal component is not loaded yet. Please refresh the page.</p>
                        </div>
                    );
                })()}
            </div>
        </div>
    );

    // Full-page Lead Detail View
    const LeadDetailView = () => (
        <div className={`min-h-screen ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
            {/* Header with breadcrumb */}
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b px-6 py-4`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <button 
                            onClick={() => {
                                setViewMode('leads');
                                setSelectedLead(null);
                            }}
                            className={`${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'} flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200`}
                            title="Go back"
                        >
                            <i className="fas fa-arrow-left"></i>
                        </button>
                        <div className="flex items-center space-x-3">
                            <div className={`w-2 h-2 rounded-full ${isDark ? 'bg-yellow-400' : 'bg-yellow-500'}`}></div>
                            <h1 className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                {selectedLead ? selectedLead.name : 'New Lead'}
                            </h1>
                        </div>
                    </div>
                    {/* Edit mode removed - always allow editing */}
                </div>
            </div>

            {/* Full-page lead detail content */}
            <div className="p-6">
                {(() => {
                    const Modal = window.LeadDetailModal;
                    return Modal ? (
                        <Modal
                        key={selectedLead?.id || 'new-lead'}
                        lead={selectedLead}
                        onSave={handleSaveLead}
                        onClose={() => {
                            setViewMode('leads');
                            setSelectedLead(null);
                            setCurrentLeadTab('overview');
                        }}
                        onDelete={handleDeleteLead}
                        onConvertToClient={convertLeadToClient}
                        allProjects={projects}
                        isFullPage={true}
                        isEditing={true}
                        hideSearchFilters={true}
                        initialTab={currentLeadTab}
                        onTabChange={setCurrentLeadTab}
                    />
                    ) : (
                        <div className="text-center py-8 text-gray-500">
                            <i className="fas fa-exclamation-triangle text-3xl mb-2"></i>
                            <p>LeadDetailModal component is not loaded yet. Please refresh the page.</p>
                        </div>
                    );
                })()}
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Modern Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                        <i className="fas fa-users text-white text-lg"></i>
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Clients and Leads</h1>
                        <p className="text-gray-600 dark:text-gray-400">Manage clients and leads</p>
                    </div>
                </div>
                
                {/* Modern Action Buttons */}
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => {
                            setSelectedClient(null);
                            setSelectedLead(null);
                            setCurrentTab('overview');
                            setViewMode('client-detail');
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                        <div className="w-5 h-5 bg-blue-100 rounded-md flex items-center justify-center">
                            <i className="fas fa-plus text-blue-600 text-xs"></i>
                        </div>
                        <span>Add Client</span>
                    </button>
                    <button 
                        onClick={() => {
                            setSelectedLead(null);
                            setSelectedClient(null);
                            setViewMode('lead-detail');
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                        <div className="w-5 h-5 bg-blue-500 rounded-md flex items-center justify-center">
                            <i className="fas fa-plus text-xs"></i>
                        </div>
                        <span>Add Lead</span>
                    </button>
                </div>
            </div>

            {/* Modern View Tabs */}
            <div className="bg-white rounded-xl border border-gray-200 p-1 inline-flex shadow-sm">
                <button
                    onClick={() => setViewMode('clients')}
                    className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                        viewMode === 'clients' 
                            ? 'bg-blue-600 text-white shadow-sm' 
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <i className="fas fa-building mr-2"></i>
                    Clients ({clients.length})
                </button>
                <button
                    onClick={() => setViewMode('leads')}
                    className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                        viewMode === 'leads' 
                            ? 'bg-blue-600 text-white shadow-sm' 
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <i className="fas fa-star mr-2"></i>
                    Leads ({leadsCount})
                </button>
                <button
                    onClick={async () => {
                        console.log('🖱️🖱️🖱️🖱️🖱️ PIPELINE TAB CLICKED! 🖱️🖱️🖱️🖱️🖱️');
                        console.log('🔍 Current viewMode BEFORE click:', viewMode);
                        setViewMode('pipeline');
                        console.log('🔍 viewMode set to "pipeline"');
                        
                        // IMMEDIATELY load opportunities for all clients when Pipeline tab is clicked
                        if (!window.api?.getOpportunitiesByClient) {
                            console.error('❌ getOpportunitiesByClient NOT AVAILABLE!');
                            return;
                        }
                        
                        if (clients.length === 0) {
                            console.warn('⚠️ No clients to load opportunities for');
                            return;
                        }
                        
                        console.log(`🚀🚀🚀 FORCE LOADING opportunities for ${clients.length} clients NOW!`);
                        try {
                            const clientsWithOpps = await Promise.all(clients.map(async (client) => {
                                try {
                                    console.log(`📡 Fetching opportunities for ${client.name} (${client.id})...`);
                                    const oppResponse = await window.api.getOpportunitiesByClient(client.id);
                                    const opportunities = oppResponse?.data?.opportunities || oppResponse?.opportunities || [];
                                    if (opportunities.length > 0) {
                                        console.log(`✅✅✅ Loaded ${opportunities.length} opps for ${client.name}:`, 
                                            opportunities.map(o => ({ id: o.id, title: o.title || o.name, stage: o.stage })));
                                    } else {
                                        console.log(`📭 No opportunities for ${client.name}`);
                                    }
                                    return { ...client, opportunities };
                                } catch (error) {
                                    console.error(`❌ Failed to load opportunities for ${client.name}:`, error);
                                    return { ...client, opportunities: client.opportunities || [] };
                                }
                            }));
                            
                            const totalOpps = clientsWithOpps.reduce((sum, c) => sum + (c.opportunities?.length || 0), 0);
                            console.log(`🎉🎉🎉 PIPELINE: LOADED ${totalOpps} TOTAL OPPORTUNITIES!`);
                            console.log(`🎉 Clients with opportunities:`, clientsWithOpps.filter(c => c.opportunities && c.opportunities.length > 0).map(c => ({ 
                                name: c.name, 
                                count: c.opportunities.length 
                            })));
                            setClients(clientsWithOpps);
                            safeStorage.setClients(clientsWithOpps);
                        } catch (error) {
                            console.error('❌ CRITICAL ERROR loading opportunities:', error);
                        }
                    }}
                    className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                        viewMode === 'pipeline' 
                            ? 'bg-blue-600 text-white shadow-sm' 
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <i className="fas fa-stream mr-2"></i>
                    Pipeline
                </button>
            </div>

            {/* Modern Search and Filters */}
            {viewMode !== 'client-detail' && viewMode !== 'lead-detail' && (
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="sm:col-span-2 lg:col-span-1">
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Search by name, industry, or contact..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-gray-50 focus:bg-white transition-colors"
                                />
                                <i className="fas fa-search absolute left-3 top-3.5 text-gray-400 text-sm"></i>
                                {searchTerm && (
                                    <button
                                        onClick={() => setSearchTerm('')}
                                        className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600 transition-colors"
                                        title="Clear search"
                                    >
                                        <i className="fas fa-times text-sm"></i>
                                    </button>
                                )}
                            </div>
                        </div>
                        <div>
                            <select
                                value={filterIndustry}
                                onChange={(e) => setFilterIndustry(e.target.value)}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-gray-50 focus:bg-white transition-colors"
                            >
                                <option value="All Industries">All Industries</option>
                                <option value="Mining">Mining</option>
                                <option value="Forestry">Forestry</option>
                                <option value="Agriculture">Agriculture</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                        <div>
                            <select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-gray-50 focus:bg-white transition-colors"
                            >
                                <option value="All Status">All Status</option>
                                <option value="Potential">Potential</option>
                                <option value="Active">Active</option>
                                <option value="Disinterested">Disinterested</option>
                            </select>
                        </div>
                    </div>
                    
                    {/* Modern Search Results Counter */}
                    {(searchTerm || filterIndustry !== 'All Industries' || filterStatus !== 'All Status') && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                    <span>
                                        Showing {filteredClients.length} of {clients.length} clients
                                        {searchTerm && ` matching "${searchTerm}"`}
                                    </span>
                                </div>
                                <button
                                    onClick={() => {
                                        setSearchTerm('');
                                        setFilterIndustry('All Industries');
                                        setFilterStatus('All Status');
                                    }}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-blue-600 hover:text-blue-700 font-medium text-sm transition-colors"
                                >
                                    <i className="fas fa-times text-xs"></i>
                                    Clear filters
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Content based on view mode */}
            {viewMode === 'clients' && <ClientsListView />}
            {viewMode === 'leads' && <LeadsListView />}
            {viewMode === 'pipeline' ? (() => {
                console.log('🚀🚀🚀🚀🚀 CONSOLE TEST - YOU SHOULD SEE THIS IF PIPELINE IS RENDERING! 🚀🚀🚀🚀🚀');
                console.log('🎯🎯🎯🎯🎯 RENDERING PipelineView component NOW! viewMode=', viewMode);
                console.log('🎯🎯🎯🎯🎯 Current clients:', clients.length);
                
                // FORCE LOAD OPPORTUNITIES IMMEDIATELY WHEN PIPELINE VIEW RENDERS
                if (clients.length > 0 && window.api?.getOpportunitiesByClient) {
                    console.log('🚀🚀🚀 PIPELINE VIEW RENDERING - FORCE LOADING OPPORTUNITIES NOW!');
                    // Load opportunities asynchronously and update state
                    Promise.all(clients.map(async (client) => {
                        try {
                            const oppResponse = await window.api.getOpportunitiesByClient(client.id);
                            const opportunities = oppResponse?.data?.opportunities || oppResponse?.opportunities || [];
                            if (opportunities.length > 0) {
                                console.log(`✅ Loaded ${opportunities.length} opps for ${client.name}`);
                            }
                            return { ...client, opportunities };
                        } catch (error) {
                            console.error(`❌ Failed for ${client.name}:`, error);
                            return { ...client, opportunities: client.opportunities || [] };
                        }
                    })).then(clientsWithOpps => {
                        const total = clientsWithOpps.reduce((sum, c) => sum + (c.opportunities?.length || 0), 0);
                        console.log(`🎉🎉🎉 TOTAL OPPORTUNITIES LOADED: ${total}`);
                        setClients(clientsWithOpps);
                        safeStorage.setClients(clientsWithOpps);
                    });
                }
                
                if (clients.length > 0) {
                    console.log('🎯🎯🎯🎯🎯 Client opportunities:', clients.map(c => ({ name: c.name, opps: c.opportunities?.length || 0, hasOpps: !!(c.opportunities) })));
                }
                try {
                    return <PipelineView />;
                } catch (error) {
                    console.error('❌ ERROR RENDERING PipelineView:', error);
                    return <div>Error rendering Pipeline: {error.message}</div>;
                }
            })() : (
                console.log('🚫 NOT rendering PipelineView, viewMode is:', viewMode) || null
            )}
            {viewMode === 'client-detail' && <ClientDetailView />}
            {viewMode === 'lead-detail' && <LeadDetailView />}
        </div>
    );
});

// Force register as the main Clients component (overrides ClientsCached if it loaded first)
window.Clients = Clients;
console.log('✅ Clients.jsx component registered (with Pipeline opportunity fixes)');


