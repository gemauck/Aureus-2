// Get dependencies from window
const { useState, useEffect, useMemo, useCallback, useRef } = React;
const SectionCommentWidget = window.SectionCommentWidget;
// Don't capture window.storage at module load; resolve at call time to avoid stale reference
// Safe storage helper functions
const safeStorage = {
    getClients: () => {
        const s = window.storage || {};
        return typeof s.getClients === 'function' ? s.getClients() : null;
    },
    setClients: (data) => {
        const s = window.storage || {};
        return typeof s.setClients === 'function' ? s.setClients(data) : null;
    },
    getProjects: () => {
        const s = window.storage || {};
        return typeof s.getProjects === 'function' ? s.getProjects() : null;
    },
    setProjects: (data) => {
        const s = window.storage || {};
        return typeof s.setProjects === 'function' ? s.setProjects(data) : null;
    }
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
    // Separate sort state for leads
    const [leadSortField, setLeadSortField] = useState('name');
    const [leadSortDirection, setLeadSortDirection] = useState('asc');
    const [clientsPage, setClientsPage] = useState(1);
    const [leadsPage, setLeadsPage] = useState(1);
    const ITEMS_PER_PAGE = 25;
    const { isDark } = window.useTheme();
    
    // Removed expensive state tracking logging
    
    // Function to load clients (can be called to refresh) - MOVED BEFORE useEffects
    const loadClients = async () => {
        console.log('🔄 Clients: loadClients() called');
        const loadStartTime = performance.now();
        try {
            // IMMEDIATELY show cached data without waiting for API
            const cachedClients = safeStorage.getClients();
            
            if (cachedClients && cachedClients.length > 0) {
                // Separate clients and leads from cache
                const filteredCachedClients = cachedClients.filter(client => 
                    client.type === 'client'
                );
                const cachedLeads = cachedClients.filter(client => 
                    client.type === 'lead'
                );
                
                // Show cached clients IMMEDIATELY
                if (filteredCachedClients.length > 0) {
                    setClients(filteredCachedClients);
                }
                
                // Show cached leads IMMEDIATELY (this is critical for fast loading!)
                if (cachedLeads.length > 0) {
                    setLeads(cachedLeads);
                    setLeadsCount(cachedLeads.length);
                }
                
                // Only load opportunities in background if Pipeline view is active
                // Use bulk fetch for much better performance
                if (viewMode === 'pipeline' && window.DatabaseAPI?.getOpportunities && filteredCachedClients.length > 0) {
                    window.DatabaseAPI.getOpportunities()
                        .then(oppResponse => {
                            const allOpportunities = oppResponse?.data?.opportunities || [];
                            const opportunitiesByClient = {};
                            allOpportunities.forEach(opp => {
                                const clientId = opp.clientId || opp.client?.id;
                                if (clientId) {
                                    if (!opportunitiesByClient[clientId]) {
                                        opportunitiesByClient[clientId] = [];
                                    }
                                    opportunitiesByClient[clientId].push(opp);
                                }
                            });
                            const updated = filteredCachedClients.map(client => ({
                                ...client,
                                opportunities: opportunitiesByClient[client.id] || client.opportunities || []
                            }));
                            setClients(updated);
                            safeStorage.setClients(updated);
                        })
                        .catch(error => console.warn('⚠️ Failed to load opportunities in bulk from cache:', error));
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
            
            // If we have cached clients AND it's been less than 30 seconds since last call, skip API entirely
            // This prevents unnecessary network requests when data is fresh
            if (timeSinceLastCall < API_CALL_INTERVAL && (clients.length > 0 || (cachedClients && cachedClients.length > 0))) {
                console.log(`⚡ Skipping API call (${(timeSinceLastCall / 1000).toFixed(1)}s since last call, cached data available)`);
                // Refresh opportunities in background using bulk fetch (much faster)
                if (viewMode === 'pipeline' && window.DatabaseAPI?.getOpportunities) {
                    window.DatabaseAPI.getOpportunities()
                        .then(oppResponse => {
                            const allOpportunities = oppResponse?.data?.opportunities || [];
                            const opportunitiesByClient = {};
                            allOpportunities.forEach(opp => {
                                const clientId = opp.clientId || opp.client?.id;
                                if (clientId) {
                                    if (!opportunitiesByClient[clientId]) {
                                        opportunitiesByClient[clientId] = [];
                                    }
                                    opportunitiesByClient[clientId].push(opp);
                                }
                            });
                            const clientsToUpdate = clients.length > 0 ? clients : (cachedClients || []);
                            const updated = clientsToUpdate.map(client => ({
                                ...client,
                                opportunities: opportunitiesByClient[client.id] || client.opportunities || []
                            }));
                            setClients(updated);
                            safeStorage.setClients(updated);
                        })
                        .catch(error => console.warn('⚠️ Failed to refresh opportunities in background:', error));
                }
                return; // Use cached data, skip API call
            }
            
            // Update last API call timestamp BEFORE making the call
            // This prevents race conditions if component re-renders during the API call
            lastApiCallTimestamp = now;
            
            // API call happens in background after showing cached data
            // Use DatabaseAPI for deduplication and caching benefits
            try {
                const apiStartTime = performance.now();
                // Prefer DatabaseAPI.getClients() for deduplication and caching
                const apiMethod = window.DatabaseAPI?.getClients || window.api?.listClients;
                if (!apiMethod) {
                    console.warn('⚠️ No API method available for fetching clients');
                    return;
                }
                const res = await apiMethod();
                const apiEndTime = performance.now();
                console.log(`⚡ API call: ${(apiEndTime - apiStartTime).toFixed(1)}ms`);
                // DatabaseAPI returns { data: { clients: [...] } }, while api.listClients might return { data: { clients: [...] } }
                const apiClients = res?.data?.clients || res?.clients || [];
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
                // Include records with type='client' OR null/undefined (legacy clients without type field)
                const clientsOnly = processedClients.filter(c => c.type === 'client' || c.type === null || c.type === undefined);
                const leadsOnly = processedClients.filter(c => c.type === 'lead');
                // Log any records with unexpected types for debugging
                const unexpectedType = processedClients.filter(c => c.type && c.type !== 'client' && c.type !== 'lead');
                if (unexpectedType.length > 0) {
                    console.warn(`⚠️ Found ${unexpectedType.length} records with unexpected type:`, unexpectedType.map(c => ({ id: c.id, name: c.name, type: c.type })));
                }
                console.log(`🔍 Clients only: ${clientsOnly.length} (including ${processedClients.filter(c => c.type === null || c.type === undefined).length} legacy/null), Leads only: ${leadsOnly.length}`);
                
                // Preserve opportunities from cached clients for instant display
                const cachedClientsForOpps = safeStorage.getClients() || [];
                const clientsWithCachedOpps = clientsOnly.map(client => {
                    const cachedClient = cachedClientsForOpps.find(c => c.id === client.id);
                    if (cachedClient?.opportunities && Array.isArray(cachedClient.opportunities) && cachedClient.opportunities.length > 0) {
                        return { ...client, opportunities: cachedClient.opportunities };
                    }
                    return client;
                });
                
                // Show clients immediately with preserved opportunities
                setClients(clientsWithCachedOpps);
                
                // Only update leads if they're mixed with clients in the API response
                // (Leads typically come from a separate getLeads() endpoint via loadLeads())
                if (leadsOnly.length > 0) {
                    // API returned leads mixed with clients - use them
                    setLeads(leadsOnly);
                    setLeadsCount(leadsOnly.length);
                    // Save to localStorage
                    if (window.storage?.setLeads) {
                        window.storage.setLeads(leadsOnly);
                        console.log(`✅ Saved ${leadsOnly.length} leads from clients API to localStorage`);
                    }
                } else {
                    // No leads in clients API - preserve current leads state (from separate getLeads() call or cache)
                    // Don't overwrite leads here - let loadLeads() handle it
                    console.log('⚡ No leads in clients API response, preserving current leads state');
                }
                
                // Save clients with preserved opportunities to localStorage (instant display)
                safeStorage.setClients(clientsWithCachedOpps);
                
                // Load fresh opportunities from API in background (only if Pipeline is active)
                // Use bulk fetch instead of per-client calls for much better performance
                if (viewMode === 'pipeline' && window.DatabaseAPI?.getOpportunities) {
                    console.log('📡 Loading all opportunities in bulk (much faster than per-client calls)...');
                    window.DatabaseAPI.getOpportunities()
                        .then(oppResponse => {
                            const allOpportunities = oppResponse?.data?.opportunities || [];
                            console.log(`✅ Loaded ${allOpportunities.length} opportunities in bulk`);
                            
                            // Group opportunities by clientId
                            const opportunitiesByClient = {};
                            allOpportunities.forEach(opp => {
                                const clientId = opp.clientId || opp.client?.id;
                                if (clientId) {
                                    if (!opportunitiesByClient[clientId]) {
                                        opportunitiesByClient[clientId] = [];
                                    }
                                    opportunitiesByClient[clientId].push(opp);
                                }
                            });
                            
                            // Attach opportunities to their clients
                            const updated = clientsOnly.map(client => ({
                                ...client,
                                opportunities: opportunitiesByClient[client.id] || []
                            }));
                            
                            const totalOpps = updated.reduce((sum, c) => sum + (c.opportunities?.length || 0), 0);
                            if (totalOpps > 0) {
                                console.log(`✅ Attached ${totalOpps} opportunities to ${clientsOnly.length} clients (bulk load)`);
                            }
                            setClients(updated);
                            safeStorage.setClients(updated);
                        })
                        .catch(error => {
                            console.warn('⚠️ Failed to load opportunities in bulk, falling back to cached opportunities:', error);
                            // Keep existing opportunities from cache
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
        // Load clients and projects immediately
        loadClients();
        loadProjects();
        
        // IMMEDIATELY try to load leads from localStorage first (from multiple sources)
        const tryLoadLeadsFromStorage = () => {
            try {
                // Try separate leads key first (most common)
                let cachedLeads = window.storage?.getLeads?.();
                
                // If not found in separate key, try extracting from clients array
                if (!cachedLeads || cachedLeads.length === 0) {
                    const allClients = safeStorage.getClients() || [];
                    cachedLeads = allClients.filter(c => c.type === 'lead');
                }
                
                if (cachedLeads && Array.isArray(cachedLeads) && cachedLeads.length > 0) {
                    console.log(`⚡ Loading ${cachedLeads.length} leads from localStorage immediately`);
                    setLeads(cachedLeads);
                    setLeadsCount(cachedLeads.length);
                    return true;
                }
            } catch (e) {
                // Silent fail
            }
            return false;
        };
        
        // Try localStorage first (instant) - this sets the state immediately
        const loadedFromStorage = tryLoadLeadsFromStorage();
        
        // Load leads from API in background (non-blocking, will skip if localStorage check passes)
        // Add a small delay to ensure React state has updated from localStorage
        const loadLeadsOnBoot = async () => {
            // Small delay to let React process the localStorage state update
            await new Promise(resolve => setTimeout(resolve, 50));
            
            try {
                const token = window.storage?.getToken?.();
                if (!token || !window.api?.getLeads) {
                    // If we didn't load from storage, try one more time after a short delay
                    if (!loadedFromStorage) {
                        setTimeout(() => {
                            tryLoadLeadsFromStorage();
                        }, 500);
                    }
                    return;
                }
                
                // loadLeads() will check localStorage again and skip API call if data exists
                console.log('📡 Checking for leads updates from API (will skip if already cached)...');
                // Set timestamp before call to prevent immediate re-throttle
                lastLeadsApiCallTimestamp = Date.now();
                await loadLeads(false);
            } catch (error) {
                console.error('❌ Failed to load leads on boot:', error);
                // Try localStorage as fallback
                if (!loadedFromStorage) {
                    setTimeout(() => {
                        tryLoadLeadsFromStorage();
                    }, 500);
                }
            }
        };
        
        // Load leads from API in background with small delay (non-blocking)
        // loadLeads() will check localStorage first and skip if data already exists
        loadLeadsOnBoot();
        
        // Also retry localStorage after a delay in case DashboardLive stores them
        setTimeout(() => {
            if (leads.length === 0) {
                console.log('🔄 Retrying leads load from localStorage...');
                tryLoadLeadsFromStorage();
            }
        }, 1000);
    }, []);

    // Keep leadsCount in sync with leads.length
    useEffect(() => {
        setLeadsCount(leads.length);
    }, [leads.length]);

    // Ensure leads are loaded from localStorage if state is empty
    useEffect(() => {
        setLeads(prevLeads => {
            if (prevLeads.length === 0) {
                const cachedLeads = window.storage?.getLeads?.();
                if (cachedLeads && Array.isArray(cachedLeads) && cachedLeads.length > 0) {
                    console.log(`🔄 Restoring ${cachedLeads.length} leads from localStorage to state`);
                    setLeadsCount(cachedLeads.length);
                    return cachedLeads;
                }
            }
            return prevLeads;
        });
    }, [leads.length]);

    // Ensure clients are loaded from localStorage if state is empty  
    useEffect(() => {
        if (clients.length === 0) {
            const cachedClients = safeStorage.getClients();
            if (cachedClients && Array.isArray(cachedClients) && cachedClients.length > 0) {
                const filteredClients = cachedClients.filter(c => c.type === 'client' || !c.type);
                if (filteredClients.length > 0) {
                    console.log(`🔄 Restoring ${filteredClients.length} clients from localStorage to state`);
                    setClients(filteredClients);
                }
            }
        }
    }, [clients.length]);

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
                    // Use bulk fetch for much better performance when Pipeline view is active
                    if (viewMode === 'pipeline' && window.DatabaseAPI?.getOpportunities) {
                        try {
                            const oppResponse = await window.DatabaseAPI.getOpportunities();
                            const allOpportunities = oppResponse?.data?.opportunities || [];
                            const opportunitiesByClient = {};
                            allOpportunities.forEach(opp => {
                                const clientId = opp.clientId || opp.client?.id;
                                if (clientId) {
                                    if (!opportunitiesByClient[clientId]) {
                                        opportunitiesByClient[clientId] = [];
                                    }
                                    opportunitiesByClient[clientId].push(opp);
                                }
                            });
                            const clientsWithOpportunities = processed.map(client => ({
                                ...client,
                                opportunities: opportunitiesByClient[client.id] || []
                            }));
                            const totalOpps = clientsWithOpportunities.reduce((sum, c) => sum + (c.opportunities?.length || 0), 0);
                            console.log(`✅ LiveDataSync: Loaded ${totalOpps} opportunities for ${clientsWithOpportunities.length} clients (bulk)`);
                            setClients(clientsWithOpportunities);
                            safeStorage.setClients(clientsWithOpportunities);
                        } catch (error) {
                            console.warn('⚠️ LiveDataSync: Failed to load opportunities in bulk, using clients without opportunities:', error);
                            setClients(processed);
                            safeStorage.setClients(processed);
                        }
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

    // Load leads from database only
    const loadLeads = async (forceRefresh = false) => {
        try {
            console.log('🔍 loadLeads() called, forceRefresh:', forceRefresh, 'current leads.length:', leads.length);
            
            // Check localStorage first to avoid unnecessary API calls if data is already loaded
            if (!forceRefresh) {
                const cachedLeads = window.storage?.getLeads?.();
                
                // If we have leads in localStorage but state is empty, load them immediately
                if (cachedLeads && Array.isArray(cachedLeads) && cachedLeads.length > 0 && leads.length === 0) {
                    console.log(`⚡ Leads already in localStorage (${cachedLeads.length} leads), loading into state`);
                    // Use functional setState to ensure it updates even if leads is empty
                    setLeads(prevLeads => {
                        if (prevLeads.length === 0) {
                            return cachedLeads;
                        }
                        return prevLeads;
                    });
                    setLeadsCount(cachedLeads.length);
                }
                
                const now = Date.now();
                const timeSinceLastCall = now - lastLeadsApiCallTimestamp;
                
                // Check if we should skip API call:
                // 1. If we have leads in state AND recent API call - skip
                // 2. If we have leads in localStorage (just loaded above) AND recent API call - skip
                const hasLeadsInState = leads.length > 0;
                const hasLeadsInCache = cachedLeads && Array.isArray(cachedLeads) && cachedLeads.length > 0;
                
                if (timeSinceLastCall < API_CALL_INTERVAL && (hasLeadsInState || hasLeadsInCache)) {
                    const leadCount = hasLeadsInState ? leads.length : cachedLeads.length;
                    console.log(`⚡ Skipping leads API call (${(timeSinceLastCall / 1000).toFixed(1)}s since last call, ${leadCount} leads already loaded)`);
                    return; // Use cached data, skip API call
                }
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
                // Clear localStorage cache to ensure fresh data
                if (window.storage?.removeLeads) {
                    window.storage.removeLeads();
                    console.log('🗑️ localStorage cache cleared for leads');
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
            
            console.log('📡 Calling getLeads API...');
            const apiResponse = await window.api.getLeads(forceRefresh);
            const rawLeads = apiResponse?.data?.leads || apiResponse?.leads || [];
            console.log(`📥 Received ${rawLeads.length} leads from API`);
            
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
                        proposals: typeof lead.proposals === 'string' ? JSON.parse(lead.proposals || '[]') : (lead.proposals || []),
                        type: lead.type || 'lead',
                        ownerId: lead.ownerId || null,
                        createdAt: lead.createdAt,
                        updatedAt: lead.updatedAt
                    };
                });
                
            setLeads(mappedLeads);
            setLeadsCount(mappedLeads.length); // Update count badge immediately
            
            // Persist leads to localStorage for fast loading on next boot
            if (window.storage?.setLeads) {
                try {
                    window.storage.setLeads(mappedLeads);
                } catch (e) {
                    // Silent fail - localStorage might be full
                }
            }
            
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
    
    // Load opportunities when switching to pipeline view (bulk loading for performance)
    useEffect(() => {
        if (viewMode !== 'pipeline') return;
        
        const loadOpportunitiesForClients = async () => {
            if (clients.length === 0 || !window.DatabaseAPI?.getOpportunities) return;
            
            // Check if any clients are missing opportunities
            const clientsNeedingOpps = clients.filter(c => !c.opportunities || c.opportunities.length === 0);
            if (clientsNeedingOpps.length === 0) return;
            
            try {
                console.log('📡 Pipeline view: Loading all opportunities in bulk...');
                const oppResponse = await window.DatabaseAPI.getOpportunities();
                const allOpportunities = oppResponse?.data?.opportunities || [];
                
                // Group opportunities by clientId
                const opportunitiesByClient = {};
                allOpportunities.forEach(opp => {
                    const clientId = opp.clientId || opp.client?.id;
                    if (clientId) {
                        if (!opportunitiesByClient[clientId]) {
                            opportunitiesByClient[clientId] = [];
                        }
                        opportunitiesByClient[clientId].push(opp);
                    }
                });
                
                // Attach opportunities to clients
                const clientsWithOpportunities = clients.map(client => ({
                    ...client,
                    opportunities: opportunitiesByClient[client.id] || client.opportunities || []
                }));
                
                console.log(`✅ Pipeline view: Attached opportunities from bulk load`);
                setClients(clientsWithOpportunities);
                safeStorage.setClients(clientsWithOpportunities);
            } catch (error) {
                console.error('❌ Pipeline: Failed to load opportunities in bulk:', error);
                // Keep existing opportunities on error
            }
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
                    services: Array.isArray(clientFormData.services) ? clientFormData.services : [],
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
                            // Preserve status as-is - don't force conversion to lowercase
                            status: comprehensiveClient.status || 'Active',
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
                            services: comprehensiveClient.services,
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
                            services: comprehensiveClient.services,
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
        
        // Validate required fields
        if (!leadFormData || !leadFormData.name || leadFormData.name.trim() === '') {
            console.error('❌ Lead name is required but empty');
            alert('Please enter an Entity Name to save the lead.');
            return;
        }
        
        try {
            const token = window.storage?.getToken?.();
            
            if (selectedLead) {
                // Update existing lead with ALL fields from form data
                // Explicitly ensure contacts, followUps, comments, and notes are included
                const updatedLead = { 
                    ...selectedLead, 
                    ...leadFormData,
                    // Ensure critical fields are preserved
                    status: leadFormData.status,
                    stage: leadFormData.stage,
                    // Explicitly include these fields to ensure they're saved
                    contacts: Array.isArray(leadFormData.contacts) ? leadFormData.contacts : (selectedLead.contacts || []),
                    followUps: Array.isArray(leadFormData.followUps) ? leadFormData.followUps : (selectedLead.followUps || []),
                    comments: Array.isArray(leadFormData.comments) ? leadFormData.comments : (selectedLead.comments || []),
                    notes: leadFormData.notes !== undefined ? leadFormData.notes : (selectedLead.notes || ''),
                    // Preserve other fields
                    sites: Array.isArray(leadFormData.sites) ? leadFormData.sites : (selectedLead.sites || []),
                    contracts: Array.isArray(leadFormData.contracts) ? leadFormData.contracts : (selectedLead.contracts || []),
                    activityLog: Array.isArray(leadFormData.activityLog) ? leadFormData.activityLog : (selectedLead.activityLog || []),
                    projectIds: Array.isArray(leadFormData.projectIds) ? leadFormData.projectIds : (selectedLead.projectIds || []),
                    proposals: Array.isArray(leadFormData.proposals) ? leadFormData.proposals : (selectedLead.proposals || [])
                };
                
                console.log('🔄 Updated lead object:', { 
                    id: updatedLead.id, 
                    status: updatedLead.status, 
                    stage: updatedLead.stage,
                    contactsCount: Array.isArray(updatedLead.contacts) ? updatedLead.contacts.length : 0,
                    followUpsCount: Array.isArray(updatedLead.followUps) ? updatedLead.followUps.length : 0,
                    hasNotes: !!updatedLead.notes,
                    commentsCount: Array.isArray(updatedLead.comments) ? updatedLead.comments.length : 0
                });
                
                if (token && window.api?.updateLead) {
                    try {
                        console.log('🌐 Calling API to update lead:', updatedLead.id);
                        console.log('🌐 Payload includes - contacts:', Array.isArray(updatedLead.contacts) ? updatedLead.contacts.length : 'not array', 
                                   'followUps:', Array.isArray(updatedLead.followUps) ? updatedLead.followUps.length : 'not array',
                                   'notes length:', updatedLead.notes ? updatedLead.notes.length : 0);
                        
                        const apiResponse = await window.api.updateLead(updatedLead.id, updatedLead);
                        console.log('✅ Lead updated in database');
                        console.log('✅ API response:', apiResponse);
                        console.log('✅ API response structure:', {
                            hasData: !!apiResponse?.data,
                            hasLead: !!apiResponse?.data?.lead,
                            hasDirectLead: !!apiResponse?.lead,
                            dataKeys: apiResponse?.data ? Object.keys(apiResponse.data) : [],
                            responseKeys: apiResponse ? Object.keys(apiResponse) : []
                        });
                        
                        // Extract the saved lead from API response - try multiple possible locations
                        let savedLead = apiResponse?.data?.lead || apiResponse?.lead || apiResponse?.data || updatedLead;
                        
                        // If we got the same object back, log a warning
                        if (savedLead === updatedLead && savedLead.id === updatedLead.id) {
                            console.warn('⚠️ API response might not contain updated lead, using optimistic update');
                        } else {
                            console.log('✅ Extracted saved lead from API response:', savedLead.id);
                        }
                        
                        // Safe JSON parser helper
                        const safeParseJSON = (value, defaultValue) => {
                            if (typeof value !== 'string') return value || defaultValue;
                            try {
                                return JSON.parse(value || JSON.stringify(defaultValue));
                            } catch (e) {
                                console.warn('⚠️ Failed to parse JSON field, using default:', e);
                                return defaultValue;
                            }
                        };
                        
                        // Parse JSON fields from database (they come as strings)
                        savedLead = {
                            ...savedLead,
                            contacts: safeParseJSON(savedLead.contacts, []),
                            followUps: safeParseJSON(savedLead.followUps, []),
                            projectIds: safeParseJSON(savedLead.projectIds, []),
                            comments: safeParseJSON(savedLead.comments, []),
                            activityLog: safeParseJSON(savedLead.activityLog, []),
                            sites: safeParseJSON(savedLead.sites, []),
                            contracts: safeParseJSON(savedLead.contracts, []),
                            billingTerms: safeParseJSON(savedLead.billingTerms, {}),
                            proposals: safeParseJSON(savedLead.proposals, [])
                        };
                        
                        // CRITICAL: Use the API response to update state, not optimistic updates
                        // This ensures we're synced with the database
                        const savedLeads = leads.map(l => l.id === savedLead.id ? savedLead : l);
                        setLeads(savedLeads);
                        setSelectedLead(savedLead); // Update selected lead with persisted data
                        
                        // Also update localStorage to keep cache in sync
                        if (window.storage?.setLeads) {
                            window.storage.setLeads(savedLeads);
                            console.log('💾 Updated leads in localStorage with saved data');
                        }
                        
                        // Invalidate API cache to ensure next load is fresh
                        if (window.DatabaseAPI?.clearCache) {
                            window.DatabaseAPI.clearCache('/leads');
                            console.log('🗑️ Cleared API cache for leads');
                        }
                        
                        console.log('✅ Saved lead data from API:', {
                            contacts: Array.isArray(savedLead.contacts) ? savedLead.contacts.length : 'not array',
                            followUps: Array.isArray(savedLead.followUps) ? savedLead.followUps.length : 'not array',
                            notes: savedLead.notes ? savedLead.notes.length : 0,
                            comments: Array.isArray(savedLead.comments) ? savedLead.comments.length : 'not array'
                        });
                    } catch (apiError) {
                        console.error('❌ API error updating lead:', apiError);
                        // If API fails, still update local state but show warning
                        const updatedLeads = leads.map(l => l.id === selectedLead.id ? updatedLead : l);
                        setLeads(updatedLeads);
                        setSelectedLead(updatedLead);
                        alert('Lead saved locally but may not have been saved to database. Please check your connection.');
                    }
                } else {
                    // No authentication - just update local state
                    const updatedLeads = leads.map(l => l.id === selectedLead.id ? updatedLead : l);
                    setLeads(updatedLeads);
                    setSelectedLead(updatedLead);
                    console.log('✅ Lead updated locally (no authentication)');
                }
                console.log('✅ Lead updated');
            } else {
                // Validate name for new leads
                if (!leadFormData.name || leadFormData.name.trim() === '') {
                    console.error('❌ Cannot create lead without a name');
                    alert('Please enter an Entity Name to create a lead.');
                    return;
                }
                
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
                    name: leadFormData.name.trim(), // Ensure name is trimmed
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
                        let savedLead = apiResponse?.data?.lead || apiResponse?.lead || apiResponse;
                        
                        // Ensure savedLead has all required fields including type
                        if (savedLead && savedLead.id) {
                            savedLead = {
                                ...savedLead,
                                type: savedLead.type || 'lead', // Ensure type is set
                                name: savedLead.name || newLead.name || '',
                                industry: savedLead.industry || newLead.industry || 'Other',
                                status: savedLead.status || newLead.status || 'Potential',
                                stage: savedLead.stage || newLead.stage || 'Awareness',
                                contacts: savedLead.contacts || newLead.contacts || [],
                                firstContactDate: savedLead.firstContactDate || savedLead.createdAt ? new Date(savedLead.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                                lastContact: savedLead.lastContact || savedLead.updatedAt ? new Date(savedLead.updatedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
                            };
                        }
                        
                        console.log('✅ Lead created in database:', savedLead);
                        
                        // Use the saved lead from database (with proper ID)
                        if (savedLead && savedLead.id) {
                            const updatedLeads = [...leads, savedLead];
                            setLeads(updatedLeads);
                            setLeadsCount(updatedLeads.length); // Update count immediately
                            console.log('✅ New lead created and saved to database');
                        } else {
                            // Fallback to local lead if API doesn't return proper response
                            const updatedLeads = [...leads, newLead];
                            setLeads(updatedLeads);
                            setLeadsCount(updatedLeads.length); // Update count immediately
                            console.log('✅ New lead created locally (API fallback)');
                        }
                    } catch (apiError) {
                        console.error('❌ API error creating lead:', apiError);
                        const errorMessage = apiError?.message || apiError?.response?.data?.error || 'Unknown error';
                        console.error('❌ Full API error details:', {
                            message: apiError.message,
                            response: apiError.response,
                            data: apiError.response?.data,
                            status: apiError.response?.status
                        });
                        
                        // Check if it's a validation error
                        if (errorMessage.includes('name required') || errorMessage.includes('name is required')) {
                            alert('Error: Lead name is required. Please make sure the Entity Name field is filled in.');
                            return; // Don't fallback to local creation for validation errors
                        }
                        
                        // For other errors, fallback to local creation
                        alert(`Warning: Could not save lead to server (${errorMessage}). Saved locally only.`);
                        const updatedLeads = [...leads, newLead];
                        setLeads(updatedLeads);
                        setLeadsCount(updatedLeads.length); // Update count immediately
                        console.log('✅ New lead created locally (API fallback)');
                    }
                } else {
                    // No token or API, create locally only
                    console.log('⚠️ No authentication token - saving lead locally only');
                    const updatedLeads = [...leads, newLead];
                    setLeads(updatedLeads);
                    setLeadsCount(updatedLeads.length); // Update count immediately
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
            const errorMessage = error?.message || 'Unknown error';
            console.error('❌ Full error details:', error);
            alert(`Failed to save lead: ${errorMessage}\n\nCheck the browser console for more details.`);
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
            setLeadsCount(updatedLeads.length); // Update count immediately
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

    // Separate sort handler for leads
    const handleLeadSort = (field) => {
        if (leadSortField === field) {
            setLeadSortDirection(leadSortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setLeadSortField(field);
            setLeadSortDirection('asc');
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

    // Sort function for leads
    const sortLeads = (leads) => {
        return [...leads].sort((a, b) => {
            let aValue = a[leadSortField];
            let bValue = b[leadSortField];
            
            // Handle date fields
            if (leadSortField === 'firstContactDate' || leadSortField === 'lastContact') {
                aValue = new Date(aValue || 0);
                bValue = new Date(bValue || 0);
            }
            
            // Handle stage sorting (Awareness < Interest < Desire < Action)
            if (leadSortField === 'stage') {
                const stageOrder = { 'Awareness': 1, 'Interest': 2, 'Desire': 3, 'Action': 4 };
                aValue = stageOrder[aValue] || 0;
                bValue = stageOrder[bValue] || 0;
            }
            
            // Convert to strings for comparison
            if (typeof aValue === 'string') aValue = aValue.toLowerCase();
            if (typeof bValue === 'string') bValue = bValue.toLowerCase();
            
            if (leadSortDirection === 'asc') {
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
            lead.name.toLowerCase().includes(searchTerm.toLowerCase());
            // Contact search removed for leads
        
        const matchesIndustry = filterIndustry === 'All Industries' || lead.industry === filterIndustry;
        // Status is hardcoded as 'active' for all leads, so status filter doesn't apply
        const matchesStatus = true;
        
        return matchesSearch && matchesIndustry && matchesStatus;
    });

    // Sort the filtered leads (default to alphabetical by name)
    const sortedLeads = sortLeads(filteredLeads);

    // Paginate clients and leads
    const clientsStartIndex = (clientsPage - 1) * ITEMS_PER_PAGE;
    const clientsEndIndex = clientsStartIndex + ITEMS_PER_PAGE;
    const paginatedClients = sortedClients.slice(clientsStartIndex, clientsEndIndex);
    const totalClientsPages = Math.ceil(sortedClients.length / ITEMS_PER_PAGE);

    const leadsStartIndex = (leadsPage - 1) * ITEMS_PER_PAGE;
    const leadsEndIndex = leadsStartIndex + ITEMS_PER_PAGE;
    const paginatedLeads = sortedLeads.slice(leadsStartIndex, leadsEndIndex);
    const totalLeadsPages = Math.ceil(sortedLeads.length / ITEMS_PER_PAGE);

    // Debug pagination
    console.log(`📄 PAGINATION DEBUG: ${sortedClients.length} clients, showing ${paginatedClients.length} on page ${clientsPage} of ${totalClientsPages}`);

    // Reset page to 1 when filters or sort changes
    useEffect(() => {
        setClientsPage(1);
        setLeadsPage(1);
    }, [searchTerm, filterIndustry, filterStatus, sortField, sortDirection, leadSortField, leadSortDirection]);

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
                if (!window.DatabaseAPI?.getOpportunities) return;
                
                const { clientId } = event.detail || {};
                if (!clientId) return;
                
                // Reload all opportunities in bulk (more efficient than per-client)
                try {
                    const oppResponse = await window.DatabaseAPI.getOpportunities();
                    const allOpportunities = oppResponse?.data?.opportunities || [];
                    
                    // Group opportunities by clientId
                    const opportunitiesByClient = {};
                    allOpportunities.forEach(opp => {
                        const id = opp.clientId || opp.client?.id;
                        if (id) {
                            if (!opportunitiesByClient[id]) {
                                opportunitiesByClient[id] = [];
                            }
                            opportunitiesByClient[id].push(opp);
                        }
                    });
                    
                    // Update clients with new opportunities
                    setClients(prevClients => {
                        const updatedClients = prevClients.map(client => ({
                            ...client,
                            opportunities: opportunitiesByClient[client.id] || client.opportunities || []
                        }));
                        safeStorage.setClients(updatedClients);
                        return updatedClients;
                    });
                } catch (error) {
                    console.error(`❌ Failed to reload opportunities in bulk:`, error);
                }
            };
            
            window.addEventListener('opportunitiesUpdated', handleOpportunitiesUpdated);
            return () => window.removeEventListener('opportunitiesUpdated', handleOpportunitiesUpdated);
        }, []); // Empty deps - only set up listener once
        
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
                <div className="flex gap-4">
                    <div className={`flex-1 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-4`}>
                        <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Active Leads</div>
                        <div className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{activeLeads.length}</div>
                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-1`}>New prospects</div>
                    </div>
                    <div className={`flex-1 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-4`}>
                        <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Active Opportunities</div>
                        <div className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-primary-600'}`}>{activeOpportunities.length}</div>
                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-1`}>Client expansions</div>
                    </div>
                    <div className={`flex-1 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-4`}>
                        <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Pipeline Value</div>
                        <div className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-green-600'}`}>
                            R {(activeLeads.reduce((sum, lead) => sum + (lead.value || 0), 0) + activeOpportunities.reduce((sum, opp) => sum + (opp.value || 0), 0)).toLocaleString('en-ZA')}
                        </div>
                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-1`}>Total potential</div>
                    </div>
                    <div className={`flex-1 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg shadow-sm border p-4`}>
                        <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Conversion Rate</div>
                        <div className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-purple-600'}`}>
                            {activeLeads.length > 0 ? Math.round((activeLeads.filter(l => l.stage === 'Action').length / activeLeads.length) * 100) : 0}%
                        </div>
                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-1`}>To action stage</div>
                    </div>
                </div>

                {/* Enhanced Pipeline Board */}
                <div className="flex gap-4 overflow-x-auto pb-6">
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
                                className={`flex-1 min-w-[250px] ${isDark ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-lg border transition-all duration-300 ${
                                    isDark ? 'border-gray-700' : 'border-gray-200'
                                } ${
                                    isDraggedOver ? `ring-2 ring-primary-500 ${isDark ? 'bg-primary-900' : 'bg-primary-50'} transform scale-105` : 'hover:shadow-xl'
                                }`}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, stage)}
                            >
                                {/* Stage Header with Gradient */}
                                <div className={`bg-gradient-to-r ${stageColors[stage]} rounded-t-xl p-3 mb-3 -mx-1 -mt-1`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 bg-white/20 rounded-lg flex items-center justify-center">
                                                <i className={`fas ${stageIcons[stage]} text-white text-xs`}></i>
                                            </div>
                                            <div>
                                                <h3 className="text-white font-semibold text-sm">{stage}</h3>
                                                <p className="text-white/80 text-xs">{stageCount} items</p>
                                            </div>
                                        </div>
                                        <span className={`px-2 py-0.5 ${isDark ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'} rounded-full text-xs font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'} border`}>
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
                                            className={`${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-white hover:bg-gray-50'} rounded-xl p-3 border transition-all duration-300 cursor-move group ${
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
                                                    {/* Contact removed from leads display */}
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
                                                className={`${isDark ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'} rounded-lg p-2.5 border shadow-sm hover:shadow-md cursor-move transition ${
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
                            <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>
                                Services
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
                        </tr>
                    </thead>
                    <tbody className={`${isDark ? 'bg-gray-800 divide-gray-700' : 'bg-white divide-gray-200'} divide-y`}>
                        {paginatedClients.length === 0 ? (
                            <tr>
                                    <td colSpan="5" className={`px-6 py-8 text-center text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                        <i className={`fas fa-inbox text-3xl ${isDark ? 'text-gray-600' : 'text-gray-300'} mb-2`}></i>
                                    <p>No clients found</p>
                                </td>
                            </tr>
                        ) : (
                            paginatedClients.filter(client => {
                                // Final render-time safety check: ensure type is 'client' and not 'Potential' status
                                return client.type === 'client' && client.status !== 'Potential';
                            }).map(client => (
                                <tr 
                                    key={client.id} 
                                    onClick={() => handleOpenClient(client)}
                                        className={`${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'} cursor-pointer transition`}
                                >
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-3">
                                            {client.thumbnail ? (
                                                <img src={client.thumbnail} alt={client.name} className="w-8 h-8 rounded-full object-cover border border-gray-200" />
                                            ) : (
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                                                    {(client.name || '?').charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            <div className={`text-sm font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{client.name}</div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className={`text-sm ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>{client.contacts?.[0]?.name || 'No contact'}</div>
                                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{client.contacts?.[0]?.email || ''}</div>
                                    </td>
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>{client.industry}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex flex-wrap gap-1.5">
                                            {(() => {
                                                const services = Array.isArray(client.services)
                                                    ? client.services
                                                    : (typeof client.services === 'string' ? (()=>{ try { return JSON.parse(client.services||'[]'); } catch { return []; } })() : []);
                                                const MAX = 3;
                                                const visible = services.slice(0, MAX);
                                                const remaining = services.length - visible.length;
                                                return (
                                                    <>
                                                        {visible.map(s => (
                                                            <span key={s} className={`inline-flex items-center px-2 py-0.5 text-[10px] rounded ${isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'}`}>
                                                                <i className="fas fa-tag mr-1"></i>{s}
                                                            </span>
                                                        ))}
                                                        {remaining > 0 && (
                                                            <span className={`inline-flex items-center px-2 py-0.5 text-[10px] rounded ${isDark ? 'bg-primary-900 text-primary-200' : 'bg-primary-100 text-primary-700'}`}>+{remaining}</span>
                                                        )}
                                                        {services.length === 0 && (
                                                            <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>None</span>
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                            (client.status === 'Active' || client.status === 'active') ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                        }`}>
                                            {client.status === 'active' ? 'Active' : client.status}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            {/* Pagination Controls */}
            {totalClientsPages > 1 && (
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-t px-6 py-4 flex items-center justify-between`}>
                    <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        Showing {clientsStartIndex + 1} to {Math.min(clientsEndIndex, sortedClients.length)} of {sortedClients.length} clients
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setClientsPage(clientsPage - 1)}
                            disabled={clientsPage === 1}
                            className={`px-3 py-1 rounded ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            Previous
                        </button>
                        <span className={`px-3 py-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            Page {clientsPage} of {totalClientsPages}
                        </span>
                        <button
                            onClick={() => setClientsPage(clientsPage + 1)}
                            disabled={clientsPage === totalClientsPages}
                            className={`px-3 py-1 rounded ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
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
                            <th 
                                className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                                onClick={() => handleLeadSort('name')}
                            >
                                <div className="flex items-center">
                                    Lead
                                    {leadSortField === 'name' && (
                                        <i className={`fas fa-sort-${leadSortDirection === 'asc' ? 'up' : 'down'} ml-1 text-xs`}></i>
                                    )}
                                </div>
                            </th>
                            <th 
                                className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                                onClick={() => handleLeadSort('industry')}
                            >
                                <div className="flex items-center">
                                    Industry
                                    {leadSortField === 'industry' && (
                                        <i className={`fas fa-sort-${leadSortDirection === 'asc' ? 'up' : 'down'} ml-1 text-xs`}></i>
                                    )}
                                </div>
                            </th>
                            <th 
                                className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                                onClick={() => handleLeadSort('stage')}
                            >
                                <div className="flex items-center">
                                    Stage
                                    {leadSortField === 'stage' && (
                                        <i className={`fas fa-sort-${leadSortDirection === 'asc' ? 'up' : 'down'} ml-1 text-xs`}></i>
                                    )}
                                </div>
                            </th>
                            <th className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider`}>
                                Status
                            </th>
                            <th 
                                className={`px-6 py-3 text-left text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-wider cursor-pointer ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                                onClick={() => handleLeadSort('firstContactDate')}
                            >
                                <div className="flex items-center">
                                    Time Since Contact
                                    {leadSortField === 'firstContactDate' && (
                                        <i className={`fas fa-sort-${leadSortDirection === 'asc' ? 'up' : 'down'} ml-1 text-xs`}></i>
                                    )}
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody className={`${isDark ? 'bg-gray-800 divide-gray-700' : 'bg-white divide-gray-200'} divide-y`}>
                        {paginatedLeads.length === 0 ? (
                            <tr>
                                <td colSpan="5" className={`px-6 py-12 text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                    <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                                        <i className="fas fa-user-plus text-2xl text-gray-400"></i>
                                    </div>
                                    <p className="text-lg font-medium mb-2">No leads found</p>
                                    <p className="text-sm">Get started by adding your first lead</p>
                                </td>
                            </tr>
                        ) : (
                            paginatedLeads.map(lead => (
                                <tr 
                                    key={`lead-${lead.id}-${lead.name}`}
                                    onClick={() => handleOpenLead(lead)}
                                        className={`${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'} cursor-pointer transition`}
                                >
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-3">
                                            {lead.thumbnail ? (
                                                <img src={lead.thumbnail} alt={lead.name} className="w-8 h-8 rounded-full object-cover border border-gray-200" />
                                            ) : (
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                                                    {(lead.name || '?').charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            <div className={`text-sm font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{lead.name}</div>
                                        </div>
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
            {/* Pagination Controls */}
            {totalLeadsPages > 1 && (
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-t px-6 py-4 flex items-center justify-between`}>
                    <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        Showing {leadsStartIndex + 1} to {Math.min(leadsEndIndex, sortedLeads.length)} of {sortedLeads.length} leads
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setLeadsPage(leadsPage - 1)}
                            disabled={leadsPage === 1}
                            className={`px-3 py-1 rounded ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            Previous
                        </button>
                        <span className={`px-3 py-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            Page {leadsPage} of {totalLeadsPages}
                        </span>
                        <button
                            onClick={() => setLeadsPage(leadsPage + 1)}
                            disabled={leadsPage === totalLeadsPages}
                            className={`px-3 py-1 rounded ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
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
                            onClick={async () => {
                                // Refresh leads from database to ensure we have latest persisted data
                                console.log('🔄 Refreshing leads after closing lead detail...');
                                await loadLeads(true); // Force refresh to get latest data
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
                        onClose={async () => {
                            // Refresh leads from database to ensure we have latest persisted data
                            console.log('🔄 Refreshing leads after closing modal...');
                            await loadLeads(true); // Force refresh to get latest data
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
                    <div className="flex-1">
                        <div className="flex items-center justify-between">
                            <div>
                                <h1 
                                    id="clients-leads-heading"
                                    className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}
                                    style={{ 
                                        color: isDark ? '#f3f4f6' : '#111827',
                                        WebkitTextFillColor: isDark ? '#f3f4f6' : '#111827'
                                    }}
                                >
                                    Clients and Leads
                                </h1>
                                <p 
                                    className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}
                                    style={{ color: isDark ? '#9ca3af' : '#4b5563' }}
                                >
                                    Manage clients and leads
                                </p>
                            </div>
                            {SectionCommentWidget && (
                                <SectionCommentWidget 
                                    sectionId="clients-main"
                                    sectionName="Clients and Leads"
                                />
                            )}
                        </div>
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
                        className={`inline-flex items-center gap-2 px-4 py-2.5 border rounded-lg text-sm font-medium transition-all duration-200 shadow-sm hover:shadow-md ${
                            isDark 
                                ? 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600' 
                                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center ${
                            isDark ? 'bg-blue-900/30' : 'bg-blue-100'
                        }`}>
                            <i className={`fas fa-plus text-xs ${
                                isDark ? 'text-blue-400' : 'text-blue-600'
                            }`}></i>
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
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-xl border p-1 inline-flex shadow-sm`}>
                <button
                    onClick={() => setViewMode('clients')}
                    className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                        viewMode === 'clients' 
                            ? 'bg-blue-600 text-white shadow-sm' 
                            : isDark 
                                ? 'text-gray-300 hover:text-gray-100 hover:bg-gray-700' 
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
                            : isDark 
                                ? 'text-gray-300 hover:text-gray-100 hover:bg-gray-700' 
                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <i className="fas fa-star mr-2"></i>
                    Leads ({leadsCount})
                </button>
                <button
                    onClick={async () => {
                        setViewMode('pipeline');
                        
                        // Load opportunities when Pipeline tab is clicked (bulk loading for performance)
                        if (!window.DatabaseAPI?.getOpportunities || clients.length === 0) {
                            return;
                        }
                        
                        // Check if clients already have opportunities loaded
                        const clientsNeedingOpps = clients.filter(c => !c.opportunities || c.opportunities.length === 0);
                        if (clientsNeedingOpps.length === 0) {
                            return; // Already loaded
                        }
                        
                        try {
                            console.log('📡 Pipeline tab clicked: Loading all opportunities in bulk...');
                            const oppResponse = await window.DatabaseAPI.getOpportunities();
                            const allOpportunities = oppResponse?.data?.opportunities || [];
                            
                            // Group opportunities by clientId
                            const opportunitiesByClient = {};
                            allOpportunities.forEach(opp => {
                                const clientId = opp.clientId || opp.client?.id;
                                if (clientId) {
                                    if (!opportunitiesByClient[clientId]) {
                                        opportunitiesByClient[clientId] = [];
                                    }
                                    opportunitiesByClient[clientId].push(opp);
                                }
                            });
                            
                            // Attach opportunities to clients (preserve existing if API doesn't have them)
                            const clientsWithOpps = clients.map(client => {
                                if (client.opportunities && client.opportunities.length > 0) {
                                    return client; // Keep existing
                                }
                                return {
                                    ...client,
                                    opportunities: opportunitiesByClient[client.id] || []
                                };
                            });
                            
                            console.log(`✅ Pipeline tab: Attached opportunities from bulk load`);
                            setClients(clientsWithOpps);
                            safeStorage.setClients(clientsWithOpps);
                        } catch (error) {
                            console.error('❌ Error loading opportunities:', error);
                        }
                    }}
                    className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                        viewMode === 'pipeline' 
                            ? 'bg-blue-600 text-white shadow-sm' 
                            : isDark 
                                ? 'text-gray-300 hover:text-gray-100 hover:bg-gray-700' 
                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <i className="fas fa-stream mr-2"></i>
                    Pipeline
                </button>
            </div>

            {/* Modern Search and Filters */}
            {viewMode !== 'client-detail' && viewMode !== 'lead-detail' && (
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-xl border p-6 shadow-sm`}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="sm:col-span-2 lg:col-span-1">
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Search by name, industry, or contact..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-colors ${
                                        isDark 
                                            ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-400 focus:bg-gray-700' 
                                            : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-500 focus:bg-white'
                                    }`}
                                />
                                <i className={`fas fa-search absolute left-3 top-3.5 text-sm ${
                                    isDark ? 'text-gray-400' : 'text-gray-400'
                                }`}></i>
                                {searchTerm && (
                                    <button
                                        onClick={() => setSearchTerm('')}
                                        className={`absolute right-3 top-3.5 transition-colors ${
                                            isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-600'
                                        }`}
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
                                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-colors ${
                                    isDark 
                                        ? 'bg-gray-700 border-gray-600 text-gray-200 focus:bg-gray-700' 
                                        : 'bg-gray-50 border-gray-300 text-gray-900 focus:bg-white'
                                }`}
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
                                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-colors ${
                                    isDark 
                                        ? 'bg-gray-700 border-gray-600 text-gray-200 focus:bg-gray-700' 
                                        : 'bg-gray-50 border-gray-300 text-gray-900 focus:bg-white'
                                }`}
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
            {viewMode === 'pipeline' && <PipelineView />}
            {viewMode === 'client-detail' && <ClientDetailView />}
            {viewMode === 'lead-detail' && <LeadDetailView />}
        </div>
    );
});

// Force register as the main Clients component (overrides ClientsCached if it loaded first)
window.Clients = Clients;
// Mark this as the preferred component version
window.Clients._isPaginated = true;
window.Clients._version = 'paginated-v1';
console.log('✅ Clients.jsx component registered (with Pipeline opportunity fixes and pagination)');

// Notify MainLayout that Clients component is now available
// Use multiple notification methods for maximum compatibility
window._clientsComponentReady = true; // Flag for late listeners

if (typeof window.dispatchEvent === 'function') {
    try {
        // Dispatch immediately
        window.dispatchEvent(new CustomEvent('clientsComponentReady'));
        console.log('📢 Dispatched clientsComponentReady event');
        
        // Also dispatch after a small delay in case listeners weren't ready
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('clientsComponentReady'));
        }, 100);
        
        // One more delayed dispatch for safety
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('clientsComponentReady'));
        }, 500);
    } catch (e) {
        console.warn('⚠️ Could not dispatch clientsComponentReady event:', e);
    }
}


