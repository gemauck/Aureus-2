// Get dependencies from window
const React = window.React;
const { useState, useEffect, useCallback, useMemo, useRef } = React;

const getWindowStorage = () => {
    if (typeof window === 'undefined') {
        return null;
    }
    return window.storage || null;
};

const storage = {
    getClients: () => {
        const store = getWindowStorage();
        if (store && typeof store.getClients === 'function') {
            try {
                return store.getClients();
            } catch (error) {
                console.warn('⚠️ Pipeline: Failed to read clients from storage', error);
            }
        }
        return [];
    },
    setClients: (data) => {
        const store = getWindowStorage();
        if (store && typeof store.setClients === 'function') {
            try {
                return store.setClients(data);
            } catch (error) {
                console.warn('⚠️ Pipeline: Failed to persist clients to storage', error);
            }
        }
        return null;
    },
    getLeads: () => {
        const store = getWindowStorage();
        if (store && typeof store.getLeads === 'function') {
            try {
                return store.getLeads();
            } catch (error) {
                console.warn('⚠️ Pipeline: Failed to read leads from storage', error);
            }
        }
        return [];
    },
    setLeads: (data) => {
        const store = getWindowStorage();
        if (store && typeof store.setLeads === 'function') {
            try {
                return store.setLeads(data);
            } catch (error) {
                console.warn('⚠️ Pipeline: Failed to persist leads to storage', error);
            }
        }
        return null;
    },
    getToken: () => {
        const store = getWindowStorage();
        if (store && typeof store.getToken === 'function') {
            try {
                return store.getToken();
            } catch (error) {
                console.warn('⚠️ Pipeline: Failed to read token from storage', error);
            }
        }
        return null;
    }
};

const normalizeLifecycleStageValue = (value) => {
    switch ((value || '').toLowerCase()) {
        case 'active':
            return 'Active';
        case 'proposal':
            return 'Proposal';
        case 'disinterested':
            return 'Disinterested';
        case 'potential':
        default:
            return 'Potential';
    }
};

/**
 * COMPREHENSIVE SALES PIPELINE PLATFORM
 * 
 * Features:
 * - List view with drag-and-drop across AIDA stages
 * - Advanced filtering by value, industry, age
 * - Pipeline metrics and forecasting
 * - Activity tracking and timeline
 * - Win/loss analysis
 * - Expected close date tracking
 * - Quick actions and bulk operations
 */

const Pipeline = ({ onOpenLead, onOpenOpportunity }) => {
    // State Management
    const [clients, setClients] = useState([]);
    const [leads, setLeads] = useState([]);
    const [draggedItem, setDraggedItem] = useState(null);
    const [draggedType, setDraggedType] = useState(null);
    const [filters, setFilters] = useState({
        search: '',
        minValue: '',
        maxValue: '',
        industry: 'All',
        status: 'All',
        stage: 'All',
        source: 'All'
    });
    const [showStarredOnly, setShowStarredOnly] = useState(false);
    const [sortBy, setSortBy] = useState('value-desc');
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'kanban'
    const [kanbanGroupBy, setKanbanGroupBy] = useState('stage'); // 'stage' (AIDA) or 'status'
    const [refreshKey, setRefreshKey] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [touchDragState, setTouchDragState] = useState(null); // { item, type, startY, currentY, targetStage }
    const [justDragged, setJustDragged] = useState(false); // Track if we just completed a drag to prevent accidental clicks
    const [draggedOverStage, setDraggedOverStage] = useState(null);
    const [dataLoaded, setDataLoaded] = useState(false); // Track when data is fully loaded from API
    const [fallbackDeal, setFallbackDeal] = useState(null); // { type: 'lead' | 'opportunity', id, data, client }
    const [listSortColumn, setListSortColumn] = useState('name'); // Default to alphabetical by name
    const [listSortDirection, setListSortDirection] = useState('asc');
    const [usingCachedOpportunities, setUsingCachedOpportunities] = useState(false);
    
    const schedulePipelineRefresh = useCallback(() => {
        setTimeout(() => setRefreshKey((k) => k + 1), 0);
    }, [setRefreshKey]);
    

    useEffect(() => {
        try {
            sessionStorage.removeItem('returnToPipeline');
        } catch (error) {
            console.warn('⚠️ Pipeline: Unable to clear returnToPipeline flag at mount', error);
        }
    }, []);

    const normalizeLifecycleStage = useCallback(normalizeLifecycleStageValue, []);

    const statusOptions = useMemo(() => {
        const statuses = new Set();

        leads.forEach((lead) => {
            if (lead?.status) {
                statuses.add(normalizeLifecycleStage(lead.status));
            }
        });

        clients.forEach((client) => {
            if (Array.isArray(client?.opportunities)) {
                client.opportunities.forEach((opp) => {
                    if (opp?.status) {
                        statuses.add(normalizeLifecycleStage(opp.status));
                    }
                });
            }
        });

        return Array.from(statuses).filter(Boolean).sort((a, b) => a.localeCompare(b));
    }, [clients, leads]);

    const handleListSort = useCallback((column) => {
        setListSortColumn((prevColumn) => {
            if (prevColumn === column) {
                setListSortDirection((prevDirection) => (prevDirection === 'asc' ? 'desc' : 'asc'));
                return prevColumn;
            }

            setListSortDirection(column === 'value' || column === 'age' ? 'desc' : 'asc');
            return column;
        });
    }, []);

    // AIDA Pipeline Stages
    const pipelineStages = [
        { 
            id: 'awareness', 
            name: 'Awareness', 
            icon: 'fa-eye',
            color: 'gray',
            description: 'Initial contact made, prospect aware of solution',
            avgDuration: '7 days'
        },
        { 
            id: 'interest', 
            name: 'Interest', 
            icon: 'fa-search',
            color: 'blue',
            description: 'Actively exploring, demo scheduled',
            avgDuration: '14 days'
        },
        { 
            id: 'desire', 
            name: 'Desire', 
            icon: 'fa-heart',
            color: 'yellow',
            description: 'Wants solution, proposal submitted',
            avgDuration: '21 days'
        },
        { 
            id: 'action', 
            name: 'Action', 
            icon: 'fa-rocket',
            color: 'green',
            description: 'Ready to close, contract negotiation',
            avgDuration: '7 days'
        }
    ];

const resolveEntityId = (entity) => {
    if (!entity || typeof entity !== 'object') {
        return null;
    }

    const candidateKeys = [
        'id',
        'leadId',
        'clientId',
        'uuid',
        '_id',
        'publicId',
        'externalId',
        'recordId',
        'tempId',
        'localId',
        'legacyId',
        'opportunityId',
        'opportunity_id',
        'dealId',
        'deal_id'
    ];

    for (const key of candidateKeys) {
        const value = entity[key];
        if (value !== undefined && value !== null && value !== '') {
            return value;
        }
    }

    if (entity.metadata?.id) {
        return entity.metadata.id;
    }

    if (Array.isArray(entity.identifiers)) {
        const identifier = entity.identifiers.find((val) => val !== undefined && val !== null && val !== '');
        if (identifier) {
            return identifier;
        }
    }

    return null;
};

const generateFallbackId = (entity, prefix = 'record') => {
    const safePrefix = prefix || 'record';
    const rawName = typeof entity?.name === 'string' && entity.name.trim() ? entity.name.trim().toLowerCase() : safePrefix;
    const sanitizedName = rawName.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || safePrefix;

    const timestampSource =
        entity?.createdAt ||
        entity?.updatedAt ||
        entity?.firstContactDate ||
        entity?.lastContact ||
        Date.now();

    let timestamp = Date.now();
    if (typeof timestampSource === 'number' && Number.isFinite(timestampSource)) {
        timestamp = timestampSource;
    } else if (typeof timestampSource === 'string') {
        const parsed = Date.parse(timestampSource);
        if (!Number.isNaN(parsed)) {
            timestamp = parsed;
        }
    }

    return `${safePrefix}-${sanitizedName}-${timestamp}`;
};

const normalizeEntityId = (entity, prefix = 'record') => {
    const existing = resolveEntityId(entity);
    if (existing !== undefined && existing !== null && existing !== '') {
        return { id: existing, generated: false };
    }

    return { id: generateFallbackId(entity, prefix), generated: true };
};

const getComparableId = (value) => {
    if (value === undefined || value === null) {
        return null;
    }
    return String(value);
};

function normalizeStageToAida(rawStage) {
    const fallbackStage = 'Awareness';
    if (rawStage === undefined || rawStage === null) {
        return fallbackStage;
    }

    const normalized = String(rawStage).trim();
    if (!normalized) {
        return fallbackStage;
    }

    const lower = normalized.toLowerCase();
    if (lower === 'prospect' || lower === 'new') {
        return fallbackStage;
    }

    // AIDA stages
    const aidaStages = ['Awareness', 'Interest', 'Desire', 'Action'];
    const aidaStageIds = ['awareness', 'interest', 'desire', 'action'];
    
    // Check if it matches a stage name exactly
    const exactMatch = aidaStages.find(stage => stage.toLowerCase() === lower);
    if (exactMatch) {
        return exactMatch;
    }
    
    // Check if it matches a stage ID
    const idIndex = aidaStageIds.indexOf(lower);
    if (idIndex !== -1) {
        return aidaStages[idIndex];
    }

    return fallbackStage;
}

function ensureDateString(value) {
    if (!value) {
        return new Date().toISOString();
    }

    if (value instanceof Date && Number.isFinite(value.getTime())) {
        return value.toISOString();
    }

    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) {
        return new Date().toISOString();
    }

    return new Date(parsed).toISOString();
}

function normalizeClientForState(client) {
    if (!client || typeof client !== 'object') {
        return null;
    }

    const baseClient = { ...client };
    const { id, generated } = normalizeEntityId(baseClient, 'client');

    return {
        ...baseClient,
        id,
        ...(generated ? { tempId: id, legacyId: client.id ?? client.clientId ?? null } : {})
    };
}

function normalizeLeadForState(lead) {
    if (!lead || typeof lead !== 'object') {
        return null;
    }

    const name =
        (typeof lead.name === 'string' && lead.name.trim()) ||
        lead.fullName ||
        lead.company ||
        lead.contactName ||
        'Unnamed Lead';

    const baseLead = {
        ...lead,
        name,
        stage: normalizeStageToAida(lead.stage),
        createdAt: ensureDateString(lead.createdAt || lead.createdDate || lead.firstContactDate),
        createdDate: ensureDateString(lead.createdDate || lead.createdAt || lead.firstContactDate)
    };

    const { id, generated } = normalizeEntityId(baseLead, 'lead');

    return {
        ...baseLead,
        id,
        ...(generated ? { tempId: id, legacyId: lead.id ?? lead.leadId ?? null } : {})
    };
}

function normalizeOpportunityForState(opportunity, clientIdFallback = null) {
    if (!opportunity || typeof opportunity !== 'object') {
        return null;
    }

    const opportunityName =
        (typeof opportunity.title === 'string' && opportunity.title.trim()) ||
        (typeof opportunity.name === 'string' && opportunity.name.trim()) ||
        opportunity.dealName ||
        opportunity.opportunityName ||
        'Untitled Opportunity';

    const baseOpportunity = {
        ...opportunity,
        title: opportunityName,
        name: opportunityName,
        stage: normalizeStageToAida(opportunity.stage),
        value: Number(opportunity.value) || 0,
        clientId:
            opportunity.clientId ??
            opportunity.client?.id ??
            clientIdFallback ??
            opportunity.accountId ??
            null,
        createdAt: ensureDateString(opportunity.createdAt || opportunity.createdDate),
        createdDate: ensureDateString(opportunity.createdDate || opportunity.createdAt)
    };

    const { id, generated } = normalizeEntityId(baseOpportunity, 'opportunity');

    return {
        ...baseOpportunity,
        id,
        ...(generated
            ? {
                  tempId: id,
                  legacyId:
                      opportunity.id ??
                      opportunity.opportunityId ??
                      opportunity.externalId ??
                      opportunity.recordId ??
                      null
              }
            : {})
    };
}

function doesOpportunityBelongToClient(opportunity, client) {
    if (!opportunity || !client) {
        return false;
    }

    const opportunityClientId =
        getComparableId(opportunity.clientId) ||
        getComparableId(opportunity.client?.id) ||
        getComparableId(opportunity.client?.clientId) ||
        getComparableId(opportunity.clientUuid) ||
        getComparableId(opportunity.accountId);

    if (!opportunityClientId) {
        return false;
    }

    const clientIdentifiers = [
        getComparableId(client.id),
        getComparableId(client.clientId),
        getComparableId(client.legacyId),
        getComparableId(client.uuid),
        getComparableId(client.tempId)
    ].filter(Boolean);

    if (clientIdentifiers.length === 0) {
        return false;
    }

    return clientIdentifiers.includes(opportunityClientId);
}

    // Load data from API and localStorage
    useEffect(() => {
        setDataLoaded(false); // Reset data loaded flag when refreshing
        loadData();
    }, [refreshKey]);

    // Preload cached data immediately on mount - but DON'T show cached opportunities (they may have stale stages)
    useEffect(() => {
        // Show cached clients and leads immediately while API loads
        // BUT: Don't show cached opportunities - they may have stale stage data
        // We'll wait for API to load opportunities with correct stages
        const savedClientsRaw = typeof storage?.getClients === 'function' ? storage.getClients() : [];
        const normalizedSavedClients = (savedClientsRaw || [])
            .map(normalizeClientForState)
            .filter(Boolean)
            .map((client) => ({
                ...client,
                opportunities: Array.isArray(client.opportunities)
                    ? client.opportunities
                          .map((opp) => normalizeOpportunityForState(opp, client.id))
                          .filter(Boolean)
                    : []
            }));

        const savedLeadsRaw = typeof storage?.getLeads === 'function' ? storage.getLeads() : [];
        const normalizedSavedLeads = (savedLeadsRaw || [])
            .map(normalizeLeadForState)
            .filter(Boolean);

        if (normalizedSavedClients.length > 0) {
            // Load clients but WITHOUT opportunities - opportunities will come from API with correct stages
            const clientsWithoutOpportunities = normalizedSavedClients.map((client) => ({
                ...client,
                // Clear opportunities - they'll be loaded from API with correct stages
                opportunities: []
            }));

            setClients(clientsWithoutOpportunities);
        }

        if (normalizedSavedLeads.length > 0) {
            setLeads(normalizedSavedLeads);
        }
    }, []);

    const loadData = async () => {
        const cachedClientsRaw =
            typeof storage?.getClients === 'function' ? storage.getClients() : [];
        const normalizedCachedClients = (cachedClientsRaw || [])
            .map(normalizeClientForState)
            .filter(Boolean)
            .map((client) => ({
                ...client,
                opportunities: Array.isArray(client.opportunities)
                    ? client.opportunities
                          .map((opp) => normalizeOpportunityForState(opp, client.id))
                          .filter(Boolean)
                    : []
            }));

        const cachedOpportunityMap = new Map();
        normalizedCachedClients.forEach((client) => {
            const clientIdKey =
                getComparableId(client.id) ||
                getComparableId(client.clientId) ||
                getComparableId(client.legacyId);

            if (!clientIdKey) {
                return;
            }

            const normalizedOpps = (client.opportunities || []).map((opp) => ({
                ...opp,
                clientId: opp.clientId ?? client.id
            }));

            if (!cachedOpportunityMap.has(clientIdKey)) {
                cachedOpportunityMap.set(clientIdKey, normalizedOpps);
            } else {
                cachedOpportunityMap.set(clientIdKey, [
                    ...cachedOpportunityMap.get(clientIdKey),
                    ...normalizedOpps
                ]);
            }
        });

        let cachedOpportunities = [];
        cachedOpportunityMap.forEach((list) => {
            if (Array.isArray(list) && list.length > 0) {
                cachedOpportunities = cachedOpportunities.concat(list);
            }
        });

        const cachedLeadsRaw =
            typeof storage?.getLeads === 'function' ? storage.getLeads() : [];
        const normalizedCachedLeads = (cachedLeadsRaw || [])
            .map(normalizeLeadForState)
            .filter(Boolean);

        if (normalizedCachedClients.length > 0) {
            setClients(normalizedCachedClients);
            setUsingCachedOpportunities(
                normalizedCachedClients.some(
                    (client) => Array.isArray(client.opportunities) && client.opportunities.length > 0
                )
            );
        }

        if (normalizedCachedLeads.length > 0) {
            setLeads(normalizedCachedLeads);
        }

        try {
            const token = typeof storage?.getToken === 'function' ? storage.getToken() : null;

            if (token && window.DatabaseAPI) {
                if (normalizedCachedClients.length === 0) {
                    setIsLoading(true);
                } else {
                }


                const [clientsResponse, leadsResponse, opportunitiesResponse] =
                    await Promise.allSettled([
                        window.DatabaseAPI.getClients(),
                        window.DatabaseAPI.getLeads(),
                        window.DatabaseAPI?.getOpportunities?.() ||
                            window.api?.getOpportunities?.() ||
                            Promise.resolve({ data: { opportunities: [] } })
                    ]);

                let apiClients = [];
                if (clientsResponse.status === 'fulfilled') {
                    const clientPayload =
                        clientsResponse.value?.data?.clients ||
                        clientsResponse.value?.clients ||
                        [];
                    apiClients = (clientPayload || [])
                        .map(normalizeClientForState)
                        .filter(Boolean);
                }

                let apiLeads = [];
                if (leadsResponse.status === 'fulfilled') {
                    const leadPayload =
                        leadsResponse.value?.data?.leads ||
                        leadsResponse.value?.leads ||
                        [];
                    apiLeads = (leadPayload || [])
                        .map(normalizeLeadForState)
                        .filter(Boolean);
                }

                let allOpportunities = [];
                if (opportunitiesResponse.status === 'fulfilled' && opportunitiesResponse.value) {
                    const oppPayload =
                        opportunitiesResponse.value?.data?.opportunities ||
                        opportunitiesResponse.value?.opportunities ||
                        [];

                    allOpportunities = (oppPayload || [])
                        .map((opp) => normalizeOpportunityForState(opp))
                        .filter(Boolean);

                } else {
                    console.warn(
                        '⚠️ Pipeline: Failed to load opportunities from API, using cached opportunities'
                    );
                    allOpportunities = cachedOpportunities;
                }

                const clientsWithOpportunities = apiClients.map((client) => {
                    const clientIdKey =
                        getComparableId(client.id) ||
                        getComparableId(client.clientId) ||
                        getComparableId(client.legacyId);

                    const clientOpportunities = allOpportunities
                        .filter((opp) => {
                            if (doesOpportunityBelongToClient(opp, client)) {
                                return true;
                            }

                            if (!clientIdKey) {
                                return false;
                            }

                            const oppClientId = getComparableId(opp.clientId);
                            return oppClientId ? oppClientId === clientIdKey : false;
                        })
                        .map((opp) => normalizeOpportunityForState(opp, client.id))
                        .filter(Boolean);

                    if (clientOpportunities.length > 0) {
                    } else if (opportunitiesResponse.status === 'fulfilled') {
                    }

                    return {
                        ...client,
                        opportunities: clientOpportunities
                    };
                });

                let finalClients = clientsWithOpportunities;

                if (opportunitiesResponse.status !== 'fulfilled' && cachedOpportunities.length > 0) {

                    finalClients = clientsWithOpportunities.map((client) => {
                        const clientIdKey =
                            getComparableId(client.id) ||
                            getComparableId(client.clientId) ||
                            getComparableId(client.legacyId);

                        if (!clientIdKey || !cachedOpportunityMap.has(clientIdKey)) {
                            return client;
                        }

                        const cachedForClient = cachedOpportunityMap.get(clientIdKey) || [];
                        if (cachedForClient.length === 0) {
                            return client;
                        }

                        const existingIds = new Set(
                            (client.opportunities || []).map((opp) => getComparableId(opp.id))
                        );

                        const mergedOpportunities = [
                            ...(client.opportunities || []),
                            ...cachedForClient.filter((opp) => {
                                const oppId = getComparableId(opp.id);
                                return oppId && !existingIds.has(oppId);
                            })
                        ];

                        return {
                            ...client,
                            opportunities: mergedOpportunities
                        };
                    });
                } else if (opportunitiesResponse.status === 'fulfilled') {
                }

                const totalOpportunities = finalClients.reduce(
                    (sum, c) => sum + (Array.isArray(c.opportunities) ? c.opportunities.length : 0),
                    0
                );


                setClients(finalClients);
                setLeads(apiLeads);

                if (typeof storage?.setClients === 'function') {
                    storage.setClients(finalClients);
                }

                if (typeof storage?.setLeads === 'function') {
                    storage.setLeads(apiLeads);
                }

                setIsLoading(false);
                setDataLoaded(true);
                setUsingCachedOpportunities(false);
                return;
            }
        } catch (error) {
            console.warn('⚠️ Pipeline: API loading failed, using cached data:', error);
        }

        if (normalizedCachedClients.length > 0 || normalizedCachedLeads.length > 0) {
            setClients(normalizedCachedClients);
            setLeads(normalizedCachedLeads);
            setUsingCachedOpportunities(
                normalizedCachedClients.some(
                    (client) => Array.isArray(client.opportunities) && client.opportunities.length > 0
                )
            );
        } else {
            setClients([]);
            setLeads([]);
            setUsingCachedOpportunities(false);
        }

        setIsLoading(false);
        setDataLoaded(true);
    };

    // Get all pipeline items (leads + client opportunities)
    const getPipelineItems = () => {
        const leadItems = leads.map(lead => {
            const normalized = normalizeEntityId(lead, 'lead');
            const normalizedId = String(normalized.id);

            if (normalized.generated) {
                console.warn('⚠️ Pipeline: Lead missing primary identifier, generated fallback ID', {
                    leadName: lead?.name || '(unnamed lead)',
                    createdAt: lead?.createdAt,
                    fallbackId: normalizedId
                });
            }

            const originalStage = lead.stage;
            const mappedStage = normalizeStageToAida(originalStage);
            
            if (originalStage && originalStage !== mappedStage) {
            }
            
            return {
                ...lead,
                id: normalizedId,
                ...(normalized.generated ? { tempId: normalizedId, legacyId: lead.id ?? lead.leadId ?? null } : {}),
                type: 'lead',
                itemType: 'New Lead',
                stage: mappedStage,
                status: normalizeLifecycleStage(lead.status),
                isStarred: Boolean(lead.isStarred),
                value: lead.value || 0,
                createdDate: lead.createdDate || new Date().toISOString(),
                expectedCloseDate: lead.expectedCloseDate || null,
                raw: lead // Store raw lead data for search
            };
        });

        const opportunityItems = [];
        clients.forEach(client => {
            // Ensure client has opportunities array (defensive check)
            if (!client) return;
            
            if (client.opportunities && Array.isArray(client.opportunities)) {
                client.opportunities.forEach(opp => {
                    if (!opp || typeof opp !== 'object') {
                        console.warn(`⚠️ Pipeline: Skipping invalid opportunity for ${client.name}:`, opp);
                        return;
                    }

                    const normalizedOpportunity = normalizeEntityId(opp, 'opportunity');
                    const normalizedOpportunityId = String(normalizedOpportunity.id);

                    if (normalizedOpportunity.generated) {
                        console.warn('⚠️ Pipeline: Opportunity missing primary identifier, generated fallback ID', {
                            opportunityName: opp?.title || opp?.name || '(untitled opportunity)',
                            clientName: client.name,
                            fallbackId: normalizedOpportunityId
                        });
                    }
                    
                    const originalStage = opp.stage;
                    const mappedStage = normalizeStageToAida(originalStage);
                    
                    if (originalStage && originalStage !== mappedStage) {
                    }
                    
                    opportunityItems.push({
                        ...opp,
                        id: normalizedOpportunityId,
                        ...(normalizedOpportunity.generated ? { tempId: normalizedOpportunityId, legacyId: opp.id ?? opp.opportunityId ?? null } : {}),
                        name: opp.title || opp.name || 'Untitled Opportunity', // render Opportunity.title as name
                        type: 'opportunity',
                        itemType: 'Expansion',
                        clientId: client.id,
                        clientName: client.name || 'Unknown Client',
                        stage: mappedStage,
                        status: normalizeLifecycleStage(opp.status),
                        isStarred: Boolean(opp.isStarred),
                        value: Number(opp.value) || 0,
                        createdDate: opp.createdAt || opp.createdDate || new Date().toISOString(), // render Opportunity.createdAt as createdDate
                        expectedCloseDate: opp.expectedCloseDate || null,
                        industry: opp.industry || client.industry || 'Other',
                        raw: { ...opp, client } // Store raw opportunity and client data for search
                    });
                });
            } else {
                // Debug: log when client has no opportunities array
                if (client.opportunities !== undefined && !Array.isArray(client.opportunities)) {
                    console.warn(`⚠️ Pipeline: Client ${client.name} has non-array opportunities:`, client.opportunities);
                }
            }
        });
        
        if (opportunityItems.length > 0) {
        } else {
        }

        return [...leadItems, ...opportunityItems];
    };

    // Apply filters and sorting
    const getFilteredItems = () => {
        let items = getPipelineItems();

        // Search filter - enhanced to match Clients/Leads search
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            const searchTerm = filters.search;
            items = items.filter(item => {
                const matchesName = item.name?.toLowerCase().includes(searchLower) || false;
                const matchesClientName = item.clientName?.toLowerCase().includes(searchLower) || false;
                const matchesCompany = item.company?.toLowerCase().includes(searchLower) || false;
                const matchesIndustry = item.industry?.toLowerCase().includes(searchLower) || false;
                
                // Search in contacts (for opportunities and leads)
                let matchesContact = false;
                const raw = item.raw || {};
                // Check item.contacts first, then raw.contacts, then raw.client?.contacts
                const contacts = item.contacts || raw.contacts || (raw.client?.contacts) || [];
                if (Array.isArray(contacts) && contacts.length > 0) {
                    matchesContact = contacts.some(contact => 
                        contact?.name?.toLowerCase().includes(searchLower) ||
                        contact?.email?.toLowerCase().includes(searchLower) ||
                        contact?.phone?.includes(searchTerm)
                    );
                }
                
                // Search in raw data for additional fields
                const matchesNotes = raw.notes?.toLowerCase().includes(searchLower) || false;
                const matchesWebsite = raw.website?.toLowerCase().includes(searchLower) || false;
                const matchesAddress = raw.address?.toLowerCase().includes(searchLower) || false;
                
                // Search in client data (for opportunities)
                const clientData = raw.client || {};
                const matchesClientNotes = clientData.notes?.toLowerCase().includes(searchLower) || false;
                const matchesClientWebsite = clientData.website?.toLowerCase().includes(searchLower) || false;
                const matchesClientAddress = clientData.address?.toLowerCase().includes(searchLower) || false;
                
                // Search in services (if available) - check both item and client
                let matchesServices = false;
                const services = raw.services || clientData.services || [];
                if (Array.isArray(services) && services.length > 0) {
                    matchesServices = services.some(service => {
                        const serviceStr = typeof service === 'string' ? service : 
                                         (service?.name || service?.id || service?.description || JSON.stringify(service));
                        return serviceStr?.toLowerCase().includes(searchLower);
                    });
                }
                
                return matchesName || matchesClientName || matchesCompany || matchesIndustry || 
                       matchesContact || matchesNotes || matchesWebsite || matchesAddress || 
                       matchesClientNotes || matchesClientWebsite || matchesClientAddress || matchesServices;
            });
        }
        
        // Starred filter
        if (showStarredOnly) {
            items = items.filter(item => item.isStarred === true);
        }

        // Industry filter
        if (filters.industry !== 'All') {
            items = items.filter(item => item.industry === filters.industry);
        }

        // Source filter
        if (filters.source !== 'All') {
            items = items.filter(item => item.source === filters.source);
        }

        // Status filter
        if (filters.status !== 'All') {
            items = items.filter(item => {
                const normalizedStatus = normalizeLifecycleStage(item.status || 'Potential');
                return normalizedStatus === filters.status;
            });
        }

        // AIDA Stage filter
        if (filters.stage !== 'All') {
            items = items.filter(item => {
                const normalizedStage = normalizeStageToAida(item.stage);
                return normalizedStage === filters.stage;
            });
        }

        const compareWithDirection = (value) => (value === 'asc' ? 1 : -1);

        const getListComparator = () => {
            const directionMultiplier = compareWithDirection(listSortDirection);
            switch (listSortColumn) {
                case 'name':
                    return (a, b) => directionMultiplier * a.name.localeCompare(b.name);
                case 'company':
                    return (a, b) => {
                        const companyA = (a.type === 'lead' ? a.company || a.name : a.clientName) || '';
                        const companyB = (b.type === 'lead' ? b.company || b.name : b.clientName) || '';
                        return directionMultiplier * companyA.localeCompare(companyB);
                    };
                case 'type':
                    return (a, b) => directionMultiplier * a.type.localeCompare(b.type);
                case 'status':
                    return (a, b) => directionMultiplier * normalizeLifecycleStage(a.status).localeCompare(normalizeLifecycleStage(b.status));
                case 'stage':
                    return (a, b) => {
                        const stageOrder = { 'Awareness': 1, 'Interest': 2, 'Desire': 3, 'Action': 4 };
                        const stageA = stageOrder[a.stage] || 0;
                        const stageB = stageOrder[b.stage] || 0;
                        return directionMultiplier * (stageA - stageB);
                    };
                default:
                    return () => 0;
            }
        };

        const getDefaultComparator = () => {
            switch (sortBy) {
                case 'value-desc':
                    return (a, b) => b.value - a.value;
                case 'value-asc':
                    return (a, b) => a.value - b.value;
                case 'date-desc':
                    return (a, b) => new Date(b.createdDate) - new Date(a.createdDate);
                case 'date-asc':
                    return (a, b) => new Date(a.createdDate) - new Date(b.createdDate);
                case 'name-asc':
                    return (a, b) => a.name.localeCompare(b.name);
                case 'name-desc':
                    return (a, b) => b.name.localeCompare(a.name);
                default:
                    return () => 0;
            }
        };

        const comparator =
            viewMode === 'list' && listSortColumn
                ? getListComparator()
                : getDefaultComparator();

        items.sort((a, b) => {
            const starDiff = (b.isStarred ? 1 : 0) - (a.isStarred ? 1 : 0);
            if (starDiff !== 0) {
                return starDiff;
            }
            return comparator(a, b);
        });

        return items;
    };

    // Drag and drop handlers - simplified to match TaskManagement pattern
    const handleDragStart = (event, item, type) => {
        if (event?.dataTransfer) {
            // Match TaskManagement: use a single key for the ID, and ALSO store type for
            // any consumers that rely only on dataTransfer (e.g. older handlers / list view)
            event.dataTransfer.setData('pipelineItemId', String(item.id));
            event.dataTransfer.setData('pipelineItemType', String(type || item.type || ''));
            event.dataTransfer.effectAllowed = 'move';
        }
        setDraggedItem(item);
        setDraggedType(type || item.type || null); // Store type in state for recovery
        setIsDragging(true);
    };

    const handleDragOver = (e, stageName = null) => {
        e.preventDefault();
        e.stopPropagation();
        if (stageName) {
            setDraggedOverStage(stageName);
        }
        if (e?.dataTransfer) {
            e.dataTransfer.dropEffect = 'move';
        }
    };

    const handleDragEnter = (e, stageName) => {
        e.preventDefault();
        if (stageName) {
            setDraggedOverStage(stageName);
        }
    };

    const handleDragLeave = (e, stageName) => {
        e.preventDefault();
        e.stopPropagation();
        // Only remove highlight if we're actually leaving the column (not just moving to a child)
        const relatedTarget = e.relatedTarget;
        if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
            setDraggedOverStage((prev) => (prev === stageName ? null : prev));
        }
    };

    const updateLeadStageOptimistically = (leadId, newStage) => {
        if (leadId === undefined || leadId === null) {
            return leads;
        }

        const normalizedLeadId = String(leadId);
        let snapshot = leads;
        setLeads((prevLeads) => {
            const updated = prevLeads.map((lead) =>
                String(lead.id) === normalizedLeadId ? { ...lead, stage: newStage } : lead
            );
            snapshot = updated;
            return updated;
        });

        if (typeof storage?.setLeads === 'function') {
            storage.setLeads(snapshot);
        }

        return snapshot;
    };

    const updateOpportunityStageOptimistically = (clientId, opportunityId, newStage) => {
        if (clientId === undefined || clientId === null || opportunityId === undefined || opportunityId === null) {
            return clients;
        }

        const normalizedClientId = String(clientId);
        const normalizedOpportunityId = String(opportunityId);
        let snapshot = clients;
        setClients((prevClients) => {
            const updated = prevClients.map((client) => {
                if (String(client.id) !== normalizedClientId) {
                    return client;
                }

                const updatedOpportunities = (client.opportunities || []).map((opp) =>
                    String(opp.id) === normalizedOpportunityId ? { ...opp, stage: newStage } : opp
                );

                return { ...client, opportunities: updatedOpportunities };
            });
            snapshot = updated;
            return updated;
        });

        if (typeof storage?.setClients === 'function') {
            storage.setClients(snapshot);
        }

        return snapshot;
    };

    const handleToggleStar = async (event, item) => {
        event.preventDefault();
        event.stopPropagation();

        const currentStarred = item.isStarred || false;
        const newStarredState = !currentStarred;

        // Update local state optimistically first for instant UI feedback
        if (item.type === 'lead') {
            const updatedLeads = leads.map(lead =>
                lead.id === item.id ? { ...lead, isStarred: newStarredState } : lead
            );
            setLeads(updatedLeads);
            storage.setLeads(updatedLeads);
        } else if (item.type === 'opportunity') {
            const updatedClients = clients.map(client => {
                if (client.id !== item.clientId) return client;
                const updatedOpportunities = (client.opportunities || []).map(opp =>
                    opp.id === item.id ? { ...opp, isStarred: newStarredState } : opp
                );
                return { ...client, opportunities: updatedOpportunities };
            });
            setClients(updatedClients);
            storage.setClients(updatedClients);
        }

        try {
            // Call API in background (non-blocking)
            if (item.type === 'lead') {
                const toggleFn = window.api?.toggleStarClient || window.DatabaseAPI?.toggleStarClient;
                if (toggleFn && item.id) {
                    toggleFn(item.id).then(() => {
                        // Clear cache but don't refetch - optimistic update is sufficient
                        if (window.DatabaseAPI?.clearCache) {
                            window.DatabaseAPI.clearCache('/leads');
                        }
                    }).catch(error => {
                        console.error('❌ Pipeline: Failed to toggle star for lead', error);
                        // Revert optimistic update on error
                        const revertedLeads = leads.map(lead =>
                            lead.id === item.id ? { ...lead, isStarred: currentStarred } : lead
                        );
                        setLeads(revertedLeads);
                        storage.setLeads(revertedLeads);
                    });
                }
            } else if (item.type === 'opportunity') {
                const toggleOpportunityFn = window.api?.toggleStarOpportunity || window.DatabaseAPI?.toggleStarOpportunity;
                if (toggleOpportunityFn && item.id) {
                    toggleOpportunityFn(item.id).then(() => {
                        // Clear cache but don't refetch - optimistic update is sufficient
                        if (window.DatabaseAPI?.clearCache) {
                            window.DatabaseAPI.clearCache('/clients');
                        }
                    }).catch(error => {
                        console.error('❌ Pipeline: Failed to toggle star for opportunity', error);
                        // Revert optimistic update on error
                        const revertedClients = clients.map(client => {
                            if (client.id !== item.clientId) return client;
                            const revertedOpportunities = (client.opportunities || []).map(opp =>
                                opp.id === item.id ? { ...opp, isStarred: currentStarred } : opp
                            );
                            return { ...client, opportunities: revertedOpportunities };
                        });
                        setClients(revertedClients);
                        storage.setClients(revertedClients);
                    });
                }
            }
        } catch (error) {
            console.error('❌ Pipeline: Failed to toggle star', error);
            alert('Failed to update favorite. Please try again.');
        }
    };

    const handleDragEnd = (e) => {
        // Simple handler like TaskManagement - just clear drag state if drop was rejected
        if (e?.dataTransfer?.dropEffect === 'none') {
            setDraggedItem(null);
            setDraggedType(null);
            setIsDragging(false);
            setDraggedOverStage(null);
        }
        // Otherwise, let the drop handler clear state in its finally block
    };

    const handleKanbanDrop = async (e, targetColumn, groupBy, itemToMove = null) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Use provided item, or try to get from state, or from dataTransfer
        let item = itemToMove || draggedItem;
        let itemType = draggedType;
        
        if (!item) {
            // Try to get from dataTransfer
            const itemIdFromTransfer = e.dataTransfer?.getData('pipelineItemId');
            const itemTypeFromTransfer = e.dataTransfer?.getData('pipelineItemType');
            
            if (itemIdFromTransfer) {
                item = filteredItems.find(i => String(i.id) === itemIdFromTransfer);
                itemType = itemTypeFromTransfer || item?.type;
            }
        }
        
        if (!item || !targetColumn) {
            console.log('❌ Kanban drop: Missing item or target', { item, targetColumn, draggedItem });
            setDraggedItem(null);
            setDraggedType(null);
            setIsDragging(false);
            setDraggedOverStage(null);
            return;
        }
        
        console.log('✅ Kanban drop:', { item: item.name || item.company, targetColumn, groupBy });

        const token = storage.getToken();
        const finalItemType = itemType || item.type;
        
        try {
            if (groupBy === 'stage') {
                // Update AIDA stage
                const newStage = targetColumn;
                
                if (finalItemType === 'lead') {
                    if (token && window.DatabaseAPI) {
                        await window.DatabaseAPI.updateLead(item.id, { stage: newStage });
                        updateLeadStageOptimistically(item.id, newStage);
                    } else {
                        updateLeadStageOptimistically(item.id, newStage);
                    }
                } else if (finalItemType === 'opportunity') {
                    if (token && window.api?.updateOpportunity) {
                        await window.api.updateOpportunity(item.id, { stage: newStage });
                    } else if (token && window.DatabaseAPI?.updateOpportunity) {
                        await window.DatabaseAPI.updateOpportunity(item.id, { stage: newStage });
                    }
                    updateOpportunityStageOptimistically(item.clientId, item.id, newStage);
                }
            } else if (groupBy === 'status') {
                // Update status
                const newStatus = targetColumn;
                
                if (finalItemType === 'lead') {
                    if (token && window.DatabaseAPI) {
                        await window.DatabaseAPI.updateLead(item.id, { status: newStatus });
                        setLeads(prevLeads => {
                            const updated = prevLeads.map(lead =>
                                lead.id === item.id ? { ...lead, status: newStatus } : lead
                            );
                            storage.setLeads(updated);
                            return updated;
                        });
                    }
                } else if (finalItemType === 'opportunity') {
                    if (token && window.api?.updateOpportunity) {
                        await window.api.updateOpportunity(item.id, { status: newStatus });
                    } else if (token && window.DatabaseAPI?.updateOpportunity) {
                        await window.DatabaseAPI.updateOpportunity(item.id, { status: newStatus });
                    }
                    setClients(prevClients => {
                        const updated = prevClients.map(client => {
                            if (client.id === item.clientId) {
                                const updatedOpportunities = client.opportunities.map(opp =>
                                    opp.id === item.id ? { ...opp, status: newStatus } : opp
                                );
                                return { ...client, opportunities: updatedOpportunities };
                            }
                            return client;
                        });
                        storage.setClients(updated);
                        return updated;
                    });
                }
            }
            
            // Refresh data after a short delay
            setTimeout(() => {
                setRefreshKey(k => k + 1);
            }, 500);
        } catch (error) {
            console.error('❌ Pipeline: Failed to update item in Kanban:', error);
            alert('Failed to save change. Please try again.');
        } finally {
            setDraggedItem(null);
            setDraggedType(null);
            setIsDragging(false);
            setDraggedOverStage(null);
        }
    };

    // Mobile touch drag handlers - use document-level listeners for better mobile support
    const handleTouchStart = (e, item, type) => {
        if (e.touches.length !== 1) return; // Only handle single touch
        
        const touch = e.touches[0];
        const cardElement = e.currentTarget;
        const cardRect = cardElement.getBoundingClientRect();
        
        const dragState = {
            item,
            type,
            startY: touch.clientY,
            currentY: touch.clientY,
            startX: touch.clientX,
            currentX: touch.clientX,
            cardRect,
            initialStage: item.stage,
            cardElement
        };
        
        setTouchDragState(dragState);
        setDraggedItem(item);
        setDraggedType(type);
        setIsDragging(true);
        
        // Add global touch event listeners to document
        const touchMoveHandler = (moveEvent) => {
            if (!dragState || moveEvent.touches.length !== 1) return;
            
            const moveTouch = moveEvent.touches[0];
            
            // Find which stage column we're over
            const stageElements = document.querySelectorAll('[data-pipeline-stage]');
            let targetStage = null;
            
            stageElements.forEach(stageEl => {
                const rect = stageEl.getBoundingClientRect();
                if (moveTouch.clientX >= rect.left && moveTouch.clientX <= rect.right &&
                    moveTouch.clientY >= rect.top && moveTouch.clientY <= rect.bottom) {
                    targetStage = stageEl.getAttribute('data-pipeline-stage');
                }
            });
            
            // Update drag state
            dragState.currentY = moveTouch.clientY;
            dragState.currentX = moveTouch.clientX;
            dragState.targetStage = targetStage;
            setDraggedOverStage(targetStage || null);
            
            setTouchDragState({ ...dragState });
            
            moveEvent.preventDefault();
        };
        
        const touchEndHandler = async (endEvent) => {
            // Remove listeners
            document.removeEventListener('touchmove', touchMoveHandler, { passive: false });
            document.removeEventListener('touchend', touchEndHandler);
            document.removeEventListener('touchcancel', touchEndHandler);
            
            // Restore body scrolling
            if (dragState.cleanup) {
                dragState.cleanup();
            }
            
            // Remove visual feedback
            if (dragState.cardElement) {
                dragState.cardElement.style.transform = '';
                dragState.cardElement.style.opacity = '';
                dragState.cardElement.style.zIndex = '';
            }
            
            const { item, type, targetStage, initialStage } = dragState;
            
            // Only perform drop if we moved enough (to distinguish from tap)
            const deltaX = Math.abs(dragState.currentX - dragState.startX);
            const deltaY = Math.abs(dragState.currentY - dragState.startY);
            const minDragDistance = 10; // pixels
            
            if ((deltaX > minDragDistance || deltaY > minDragDistance) && 
                targetStage && targetStage !== initialStage) {
                
                // Perform the drop - call API first, then update local state on success
                const token = storage.getToken();
                
                if (type === 'lead') {
                    if (token && window.DatabaseAPI) {
                        try {
                            await window.DatabaseAPI.updateLead(item.id, { stage: targetStage });
                            
                            // Update local state after successful API call
                            const updatedLeads = leads.map(lead => 
                                lead.id === item.id ? { ...lead, stage: targetStage } : lead
                            );
                            setLeads(updatedLeads);
                            storage.setLeads(updatedLeads);
                            
                            // Refresh data from API to ensure consistency
                            setTimeout(() => {
                                setRefreshKey(k => k + 1);
                            }, 500);
                        } catch (error) {
                            console.error('❌ Pipeline: Failed to update lead stage in API:', error);
                            alert('Failed to save lead stage change. Please try again.');
                        }
                    } else {
                        // No auth - just update local state
                        const updatedLeads = leads.map(lead => 
                            lead.id === item.id ? { ...lead, stage: targetStage } : lead
                        );
                        setLeads(updatedLeads);
                    }
                } else if (type === 'opportunity') {
                    if (token && window.api?.updateOpportunity) {
                        try {
                            await window.api.updateOpportunity(item.id, { stage: targetStage });
                            
                            // Update local state after successful API call
                            const updatedClients = clients.map(client => {
                                if (client.id === item.clientId) {
                                    const updatedOpportunities = client.opportunities.map(opp =>
                                        opp.id === item.id ? { ...opp, stage: targetStage } : opp
                                    );
                                    return { ...client, opportunities: updatedOpportunities };
                                }
                                return client;
                            });
                            setClients(updatedClients);
                            storage.setClients(updatedClients);
                            
                            // Refresh data from API to ensure consistency
                            setTimeout(() => {
                                setRefreshKey(k => k + 1);
                            }, 500);
                        } catch (error) {
                            console.error('❌ Pipeline: Failed to update opportunity stage in API:', error);
                            alert('Failed to save opportunity stage change. Please try again.');
                        }
                    } else if (token && window.DatabaseAPI?.updateOpportunity) {
                        try {
                            await window.DatabaseAPI.updateOpportunity(item.id, { stage: targetStage });
                            
                            // Update local state after successful API call
                            const updatedClients = clients.map(client => {
                                if (client.id === item.clientId) {
                                    const updatedOpportunities = client.opportunities.map(opp =>
                                        opp.id === item.id ? { ...opp, stage: targetStage } : opp
                                    );
                                    return { ...client, opportunities: updatedOpportunities };
                                }
                                return client;
                            });
                            setClients(updatedClients);
                            storage.setClients(updatedClients);
                            
                            // Refresh data from API to ensure consistency
                            setTimeout(() => {
                                setRefreshKey(k => k + 1);
                            }, 500);
                        } catch (error) {
                            console.error('❌ Pipeline: Failed to update opportunity via DatabaseAPI:', error);
                            alert('Failed to save opportunity stage change. Please try again.');
                        }
                    } else if (token && window.DatabaseAPI) {
                        try {
                            const updatedClients = clients.map(client => {
                                if (client.id === item.clientId) {
                                    const updatedOpportunities = client.opportunities.map(opp =>
                                        opp.id === item.id ? { ...opp, stage: targetStage } : opp
                                    );
                                    return { ...client, opportunities: updatedOpportunities };
                                }
                                return client;
                            });
                            
                            const clientToUpdate = updatedClients.find(c => c.id === item.clientId);
                            if (clientToUpdate) {
                                await window.DatabaseAPI.updateClient(item.clientId, { 
                                    opportunities: clientToUpdate.opportunities 
                                });
                                
                                setClients(updatedClients);
                                storage.setClients(updatedClients);
                                
                                // Refresh data from API to ensure consistency
                                setTimeout(() => {
                                    setRefreshKey(k => k + 1);
                                }, 500);
                            }
                        } catch (error) {
                            console.error('❌ Pipeline: Failed to update client opportunities in API:', error);
                            alert('Failed to save opportunity stage change. Please try again.');
                        }
                    } else {
                        // No auth - just update local state
                        const updatedClients = clients.map(client => {
                            if (client.id === item.clientId) {
                                const updatedOpportunities = client.opportunities.map(opp =>
                                    opp.id === item.id ? { ...opp, stage: targetStage } : opp
                                );
                                return { ...client, opportunities: updatedOpportunities };
                            }
                            return client;
                        });
                        setClients(updatedClients);
                    }
                }
            }
            
            // Reset state
            setTouchDragState(null);
            setDraggedItem(null);
            setDraggedType(null);
            setIsDragging(false);
            setDraggedOverStage(null);
            
            // Prevent click event from firing if we dragged
            if (deltaX > minDragDistance || deltaY > minDragDistance) {
                setJustDragged(true);
                endEvent.preventDefault();
                // Reset justDragged after a short delay
                setTimeout(() => setJustDragged(false), 300);
            } else if (!targetStage || targetStage === initialStage) {
                // Treat as tap/click when no stage change occurred
                openDealDetail(item);
            }
        };
        
        // Add visual feedback
        cardElement.style.transform = 'scale(0.95)';
        cardElement.style.opacity = '0.7';
        cardElement.style.zIndex = '1000';
        
        // Prevent body scrolling during drag
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        
        // Add global listeners
        document.addEventListener('touchmove', touchMoveHandler, { passive: false });
        document.addEventListener('touchend', touchEndHandler);
        document.addEventListener('touchcancel', touchEndHandler);
        
        // Store cleanup function in dragState
        dragState.cleanup = () => {
            document.body.style.overflow = originalOverflow;
        };
        
        // Prevent scrolling while dragging
        e.preventDefault();
    };

    // Legacy handlers for compatibility (now handled by document listeners)
    const handleTouchMove = (e) => {
        // This is now handled by document-level listeners
        // Keep for backward compatibility but don't prevent default here
    };

    const handleTouchEnd = async (e) => {
        // This is now handled by document-level listeners
        // Keep for backward compatibility
    };

    // Get deal age in days
    const getDealAge = (createdDate) => {
        const created = new Date(createdDate);
        const now = new Date();
        return Math.floor((now - created) / (1000 * 60 * 60 * 24));
    };

    // Get age badge color
    const getAgeBadgeColor = (days) => {
        if (days <= 7) return 'bg-green-100 text-green-800';
        if (days <= 30) return 'bg-blue-100 text-blue-800';
        if (days <= 60) return 'bg-yellow-100 text-yellow-800';
        return 'bg-red-100 text-red-800';
    };

    const getLifecycleBadgeColor = (status = '') => {
        const normalized = (status || '').toLowerCase();
        switch (normalized) {
            case 'active':
                return 'bg-green-100 text-green-700';
            case 'proposal':
                return 'bg-purple-100 text-purple-700';
            case 'disinterested':
                return 'bg-gray-200 text-gray-600';
            case 'potential':
            default:
                return 'bg-blue-100 text-blue-700';
        }
    };

    const formatCurrency = (value) => {
        const numericValue = Number.isFinite(Number(value)) ? Number(value) : 0;
        return `R ${numericValue.toLocaleString('en-ZA')}`;
    };

    const closeFallbackDetail = useCallback((refresh = false) => {
        setFallbackDeal(null);
        try {
            sessionStorage.removeItem('returnToPipeline');
        } catch (error) {
            console.warn('⚠️ Pipeline: Unable to clear returnToPipeline flag on fallback close', error);
        }
        if (refresh) {
            schedulePipelineRefresh();
        }
    }, [schedulePipelineRefresh]);

    const openDealDetail = (item) => {
        if (!item || !item.id) return;
        try {
            sessionStorage.setItem('returnToPipeline', 'true');
        } catch (error) {
            console.warn('⚠️ Pipeline: Unable to set returnToPipeline flag', error);
        }

        if (item.type === 'lead') {
            const resolvedLeadId = item.legacyId || item.id;
            if (!resolvedLeadId) {
                console.warn('⚠️ Pipeline: Unable to open lead without identifier', item);
                return;
            }

            const payload = { leadId: resolvedLeadId, leadData: { ...item, id: resolvedLeadId } };
            let handled = false;

            if (typeof onOpenLead === 'function') {
                onOpenLead({ ...payload, origin: 'prop' });
                handled = true;
            }

            if (!handled && typeof window.__openLeadDetailFromPipeline === 'function') {
                window.__openLeadDetailFromPipeline({ ...payload, origin: 'prop' });
                handled = true;
            }

            if (!handled) {
                setFallbackDeal({
                    type: 'lead',
                    id: resolvedLeadId,
                    data: item
                });
            }

            window.dispatchEvent(new CustomEvent('openLeadDetailFromPipeline', {
                detail: { ...payload, origin: handled ? 'prop' : 'event' }
            }));
        } else {
            const resolvedOpportunityId = item.legacyId || item.id;
            if (!resolvedOpportunityId) {
                console.warn('⚠️ Pipeline: Unable to open opportunity without identifier', item);
                return;
            }

            const opportunityPayload = {
                opportunityId: resolvedOpportunityId,
                clientId: item.clientId || item.client?.id,
                clientName: item.clientName || item.client?.name || item.name,
                opportunity: { ...item, id: resolvedOpportunityId }
            };
            let handled = false;

            if (typeof onOpenOpportunity === 'function') {
                onOpenOpportunity({ ...opportunityPayload, origin: 'prop' });
                handled = true;
            }

            if (!handled && typeof window.__openOpportunityDetailFromPipeline === 'function') {
                window.__openOpportunityDetailFromPipeline({ ...opportunityPayload, origin: 'prop' });
                handled = true;
            }

            if (!handled) {
                setFallbackDeal({
                    type: 'opportunity',
                    id: resolvedOpportunityId,
                    data: item,
                    client: item.client || (item.clientId || item.clientName || item.name
                        ? {
                            id: item.clientId || item.id,
                            name: item.clientName || item.client?.name || item.name
                        }
                        : null)
                });
            }

            window.dispatchEvent(new CustomEvent('openOpportunityDetailFromPipeline', {
                detail: { ...opportunityPayload, origin: handled ? 'prop' : 'event' }
            }));
        }
    };

    const filteredItems = getFilteredItems();
    const LeadDetailModalComponent = window.LeadDetailModal;
    const OpportunityDetailModalComponent = window.OpportunityDetailModal;
    const availableProjects = storage?.getProjects?.() || [];

    // Kanban View Component
    const KanbanView = ({ 
        items, 
        groupBy, 
        pipelineStages, 
        statusOptions,
        onItemClick,
        onItemDragStart,
        onItemDragEnd,
        onItemDrop,
        onToggleStar,
        normalizeStageToAida,
        normalizeLifecycleStage,
        formatCurrency,
        getLifecycleBadgeColor,
        draggedItem,
        draggedOverStage,
        setDraggedOverStage
    }) => {
        // Determine columns based on groupBy
        const columns = useMemo(() => {
            if (groupBy === 'stage') {
                return pipelineStages.map(stage => ({
                    id: stage.id,
                    name: stage.name,
                    color: stage.color,
                    icon: stage.icon
                }));
            } else {
                // Group by status
                return statusOptions.map(status => ({
                    id: status.toLowerCase().replace(/\s+/g, '-'),
                    name: status,
                    color: 'blue',
                    icon: 'fa-circle'
                }));
            }
        }, [groupBy, pipelineStages, statusOptions]);

        // Group items by column
        const itemsByColumn = useMemo(() => {
            return columns.map(column => {
                const columnItems = items.filter(item => {
                    if (groupBy === 'stage') {
                        const normalizedStage = normalizeStageToAida(item.stage);
                        return normalizedStage === column.name;
                    } else {
                        const normalizedStatus = normalizeLifecycleStage(item.status || 'Potential');
                        return normalizedStatus === column.name;
                    }
                });
                return {
                    column,
                    items: columnItems
                };
            });
        }, [columns, items, groupBy, normalizeStageToAida, normalizeLifecycleStage]);

        const handleDragOver = (e) => {
            e.preventDefault();
            if (e?.dataTransfer) {
                e.dataTransfer.dropEffect = 'move';
            }
        };

        const handleDragLeave = (e) => {
            // Only clear if we're actually leaving the column
            const relatedTarget = e.relatedTarget;
            if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
                if (setDraggedOverStage) {
                    setDraggedOverStage(null);
                }
            }
        };

        const handleDrop = (e, columnName) => {
            e.preventDefault();
            if (setDraggedOverStage) {
                setDraggedOverStage(null);
            }
            
            // Get item data from dataTransfer (like working KanbanView)
            const itemIdStr = e.dataTransfer.getData('pipelineItemId');
            const itemTypeStr = e.dataTransfer.getData('pipelineItemType');
            
            if (!itemIdStr || !columnName) {
                console.log('❌ Kanban drop: Missing data', { itemIdStr, columnName });
                return;
            }
            
            // Find the item from the items array
            const itemToMove = items.find(item => String(item.id) === itemIdStr);
            if (!itemToMove) {
                console.log('❌ Kanban drop: Item not found', { itemIdStr, items: items.length });
                return;
            }
            
            console.log('✅ Kanban drop:', { item: itemToMove.name || itemToMove.company, targetColumn: columnName, groupBy });
            
            // Call the drop handler with the item
            if (onItemDrop) {
                onItemDrop(e, columnName, groupBy, itemToMove);
            }
        };

        const getColumnColorClasses = (color) => {
            const colorMap = {
                gray: 'bg-gray-50 border-gray-200',
                blue: 'bg-blue-50 border-blue-200',
                yellow: 'bg-yellow-50 border-yellow-200',
                green: 'bg-green-50 border-green-200'
            };
            return colorMap[color] || colorMap.gray;
        };

        const getColumnHeaderColorClasses = (color) => {
            const colorMap = {
                gray: 'bg-gray-100 text-gray-800 border-gray-300',
                blue: 'bg-blue-100 text-blue-800 border-blue-300',
                yellow: 'bg-yellow-100 text-yellow-800 border-yellow-300',
                green: 'bg-green-100 text-green-800 border-green-300'
            };
            return colorMap[color] || colorMap.gray;
        };

        return (
            <div className="w-full overflow-x-auto pb-4">
                <div className="flex gap-4 min-w-max px-1">
                    {itemsByColumn.map(({ column, items: columnItems }) => {
                        const isDraggedOver = draggedOverStage === column.name;
                        const columnColorClasses = getColumnColorClasses(column.color);
                        const headerColorClasses = getColumnHeaderColorClasses(column.color);
                        
                        return (
                            <div
                                key={column.id}
                                data-pipeline-stage={column.name}
                                className={`flex-shrink-0 w-72 sm:w-80 transition-all duration-200 ${
                                    isDraggedOver ? 'scale-105' : ''
                                }`}
                            >
                                {/* Column Header */}
                                <div className={`${headerColorClasses} rounded-t-lg px-4 py-3 border-b-2 mb-2`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <i className={`fas ${column.icon} text-sm`}></i>
                                            <h3 className="text-sm font-semibold">{column.name}</h3>
                                            <span className="px-2 py-0.5 text-xs rounded-full bg-white/70 font-medium">
                                                {columnItems.length}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Column Cards */}
                                <div 
                                    className={`${columnColorClasses} rounded-b-lg p-3 min-h-[500px] space-y-2 border-2 transition-all duration-200 ${
                                        isDraggedOver ? 'border-blue-400 shadow-lg' : 'border-transparent'
                                    }`}
                                    onDragEnter={(e) => {
                                        e.preventDefault();
                                        if (setDraggedOverStage) {
                                            setDraggedOverStage(column.name);
                                        }
                                    }}
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={(e) => handleDrop(e, column.name)}
                                >
                                    {columnItems.length === 0 ? (
                                        <div className="text-center py-8 text-gray-400">
                                            <i className="fas fa-inbox text-2xl mb-2"></i>
                                            <p className="text-xs">No items</p>
                                        </div>
                                    ) : (
                                        columnItems.map(item => {
                                            const isDragging = draggedItem?.id === item.id;
                                            const itemType = item.type || 'lead';
                                            const itemName = item.name || item.company || item.clientName || 'Unnamed';
                                            const itemValue = item.value || 0;
                                            const itemIndustry = item.industry || '';
                                            const itemStatus = item.status || 'Potential';
                                            const itemStage = normalizeStageToAida(item.stage);
                                            
                                            return (
                                                <div
                                                    key={`${itemType}-${item.id}`}
                                                    draggable
                                                    onDragStart={(e) => {
                                                        console.log('🎯 Drag start triggered', { itemId: item.id, target: e.target });
                                                        
                                                        // Prevent drag if clicking on button
                                                        if (e.target.closest('button')) {
                                                            console.log('❌ Drag prevented - clicked on button');
                                                            e.preventDefault();
                                                            return false;
                                                        }
                                                        
                                                        // Set dataTransfer data (like working KanbanView)
                                                        e.dataTransfer.setData('pipelineItemId', String(item.id));
                                                        e.dataTransfer.setData('pipelineItemType', String(itemType));
                                                        e.dataTransfer.effectAllowed = 'move';
                                                        
                                                        console.log('✅ Drag data set', { 
                                                            itemId: item.id, 
                                                            itemType,
                                                            dataTransferTypes: e.dataTransfer.types 
                                                        });
                                                        
                                                        // Also call the handler for state management
                                                        if (onItemDragStart) {
                                                            onItemDragStart(e, item, itemType);
                                                        }
                                                    }}
                                                    onDragEnd={(e) => {
                                                        if (onItemDragEnd) {
                                                            onItemDragEnd(e);
                                                        }
                                                    }}
                                                    onClick={(e) => {
                                                        // Don't trigger card click if clicking button
                                                        if (e.target.closest('button')) {
                                                            return;
                                                        }
                                                        if (onItemClick) {
                                                            onItemClick(item);
                                                        }
                                                    }}
                                                    className={`bg-white rounded-lg p-3 cursor-move transition-all duration-200 border border-gray-200 hover:shadow-md hover:border-blue-300 ${
                                                        isDragging ? 'opacity-50 scale-95' : 'hover:scale-[1.02]'
                                                    }`}
                                                >
                                                    {/* Card Header */}
                                                    <div className="flex items-start justify-between mb-2">
                                                        <div className="flex-1 min-w-0">
                                                            <h4 className="text-sm font-semibold text-gray-900 truncate">
                                                                {itemName}
                                                            </h4>
                                                            {itemIndustry && (
                                                                <p className="text-xs text-gray-500 mt-0.5 truncate">
                                                                    {itemIndustry}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <button
                                                            type="button"
                                                            draggable="false"
                                                            onDragStart={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                return false;
                                                            }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                e.preventDefault();
                                                                if (onToggleStar) {
                                                                    onToggleStar(e, item);
                                                                }
                                                            }}
                                                            className={`ml-2 flex-shrink-0 transition-colors cursor-pointer ${
                                                                item.isStarred 
                                                                    ? 'text-yellow-500' 
                                                                    : 'text-gray-300 hover:text-yellow-400'
                                                            }`}
                                                        >
                                                            <i className={`fas fa-star text-sm ${item.isStarred ? 'fas' : 'far'}`}></i>
                                                        </button>
                                                    </div>

                                                    {/* Card Body - Minimal Info */}
                                                    <div className="space-y-1.5">
                                                        {/* Value */}
                                                        {itemValue > 0 && (
                                                            <div className="text-xs font-semibold text-blue-600">
                                                                {formatCurrency(itemValue)}
                                                            </div>
                                                        )}

                                                        {/* Type Badge */}
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <span className={`px-2 py-0.5 text-[10px] rounded-full font-medium ${
                                                                itemType === 'lead' 
                                                                    ? 'bg-blue-100 text-blue-700' 
                                                                    : 'bg-purple-100 text-purple-700'
                                                            }`}>
                                                                {itemType === 'lead' ? 'Lead' : 'Opportunity'}
                                                            </span>
                                                            
                                                            {/* Show opposite grouping as badge */}
                                                            {groupBy === 'stage' && (
                                                                <span className={`px-2 py-0.5 text-[10px] rounded-full ${getLifecycleBadgeColor(itemStatus)}`}>
                                                                    {normalizeLifecycleStage(itemStatus)}
                                                                </span>
                                                            )}
                                                            {groupBy === 'status' && (
                                                                <span className={`px-2 py-0.5 text-[10px] rounded-full ${
                                                                    itemStage === 'Awareness' ? 'bg-gray-100 text-gray-800' :
                                                                    itemStage === 'Interest' ? 'bg-blue-100 text-blue-800' :
                                                                    itemStage === 'Desire' ? 'bg-yellow-100 text-yellow-800' :
                                                                    itemStage === 'Action' ? 'bg-green-100 text-green-800' :
                                                                    'bg-gray-100 text-gray-800'
                                                                }`}>
                                                                    {itemStage}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // Render pipeline card
    const PipelineCard = ({ item }) => {
        const age = getDealAge(item.createdDate);
        const wasDraggedRef = React.useRef(false);

        return (
            <div
                draggable={true}
                onDragStart={(e) => {
                    wasDraggedRef.current = false;
                    handleDragStart(e, item, item.type);
                }}
                onDragEnd={(e) => {
                    wasDraggedRef.current = true;
                    setTimeout(() => {
                        wasDraggedRef.current = false;
                    }, 100);
                    handleDragEnd(e);
                }}
                onTouchStart={(e) => handleTouchStart(e, item, item.type)}
                onClick={(e) => {
                    // Prevent click event if we just finished dragging (like TaskManagement)
                    if (wasDraggedRef.current || justDragged || touchDragState) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                    }
                    openDealDetail(item);
                }}
                className={`bg-white rounded-md border border-gray-200 cursor-move flex flex-col gap-1.5 p-2 touch-none ${
                    !isDragging ? 'hover:border-gray-300 transition' : ''
                } ${draggedItem?.id === item.id ? 'opacity-50' : ''}`}
                style={{
                    WebkitTouchCallout: 'none',
                    WebkitUserSelect: 'none',
                    userSelect: 'none',
                    pointerEvents: isDragging && draggedItem?.id === item.id ? 'none' : 'auto',
                    cursor: 'grab',
                    touchAction: 'none'
                }}
            >
                <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm text-gray-900 truncate">
                        {item.name || 'Untitled deal'}
                    </p>
                    <span
                        className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                            item.type === 'lead' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'
                        }`}
                    >
                        {item.type === 'lead' ? 'Lead' : 'Opportunity'}
                    </span>
                </div>

                <p className="text-xs text-gray-500 truncate">
                    {item.clientName || item.company || 'No company'}
                </p>

                <div className="flex items-center justify-between text-xs text-gray-500">
                    <span className="font-semibold text-gray-800 text-sm">{formatCurrency(item.value)}</span>
                    <span>{age}d</span>
                </div>
            </div>
        );
    };

    // Removed global and native listeners - using simple React synthetic events like TaskManagement

    // Kanban diagnostic removed - only List view is available

    // Kanban view removed - only List view is available

    // Combined Deals List View
    const ListView = () => {
        const items = getFilteredItems();

        useEffect(() => {
            if (viewMode !== 'list') {
                return;
            }

            if (typeof window === 'undefined' || typeof document === 'undefined') {
                return;
            }

            const labelsToHide = ['Value', 'Age', 'Expected Close'];
            const hideLegacyColumns = () => {
                const table = document.querySelector('[data-pipeline-list-table]');
                if (!table) {
                    return;
                }

                const headerCells = Array.from(table.querySelectorAll('thead th'));
                const bodyRows = Array.from(table.querySelectorAll('tbody tr'));

                headerCells.forEach((th, index) => {
                    const label = th.textContent?.trim();
                    if (label && labelsToHide.includes(label)) {
                        th.style.display = 'none';
                        bodyRows.forEach((row) => {
                            const cell = row.children[index];
                            if (cell) {
                                cell.style.display = 'none';
                            }
                        });
                    }
                });
            };

            const rafId = window.requestAnimationFrame(() => hideLegacyColumns());

            return () => {
                window.cancelAnimationFrame(rafId);
            };
        }, [viewMode, items.length, listSortColumn, listSortDirection]);

        const getAriaSort = (column) => {
            if (listSortColumn !== column) {
                return 'none';
            }
            return listSortDirection === 'asc' ? 'ascending' : 'descending';
        };

        const renderSortableHeader = (label, column) => {
            const isActive = listSortColumn === column;
            const iconClass = !isActive
                ? 'fas fa-sort text-gray-300'
                : listSortDirection === 'asc'
                    ? 'fas fa-sort-up text-blue-600'
                    : 'fas fa-sort-down text-blue-600';

            return (
                <th
                    className="px-6 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                    aria-sort={getAriaSort(column)}
                    scope="col"
                >
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleListSort(column);
                        }}
                        className={`flex items-center gap-2 transition-colors ${
                            isActive ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <span>{label}</span>
                        <i className={`${iconClass} text-[11px]`}></i>
                    </button>
                </th>
            );
        };

        return (
            <div className="space-y-4">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200" data-pipeline-list-table>
                            <thead className="bg-gray-50">
                                <tr>
                                    {renderSortableHeader('Name', 'name')}
                                    {renderSortableHeader('Type', 'type')}
                                    {renderSortableHeader('Stage', 'stage')}
                                    {renderSortableHeader('Status', 'status')}
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {items.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="px-4 py-12 text-center text-sm text-gray-500">
                                            <i className="fas fa-list-ul text-3xl text-gray-300 mb-3"></i>
                                            <p>No leads or opportunities match your filters.</p>
                                            <p className="text-xs text-gray-400 mt-1">Adjust filters to see more results.</p>
                                        </td>
                                    </tr>
                                ) : (
                                    items.map(item => {
                                        const isLead = item.type === 'lead';

                                        return (
                                            <tr
                                                key={`${item.type}-${item.id}`}
                                                className="hover:bg-gray-50 cursor-pointer transition"
                                                onClick={() => openDealDetail(item)}
                                            >
                                                <td className="px-6 py-2">
                                                    <div className="flex items-center gap-3">
                                                        <button
                                                            type="button"
                                                            aria-label={item.isStarred ? 'Unstar deal' : 'Star deal'}
                                                            className="shrink-0 flex items-center justify-center w-7 h-7 rounded-full hover:bg-yellow-50 transition"
                                                            onClick={(e) => handleToggleStar(e, item)}
                                                            onMouseDown={(e) => {
                                                                e.stopPropagation();
                                                                e.preventDefault();
                                                            }}
                                                            onTouchStart={(e) => {
                                                                e.stopPropagation();
                                                                e.preventDefault();
                                                            }}
                                                        >
                                                            <i className={`${item.isStarred ? 'fas text-yellow-500' : 'far text-gray-300'} fa-star text-sm`}></i>
                                                        </button>
                                                        <span className="text-sm font-medium text-gray-900">
                                                            {item.name}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-2">
                                                    <span className={`inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full ${isLead ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                                                        {isLead ? 'Lead' : 'Opportunity'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-2">
                                                    <span className={`inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full ${
                                                        item.stage === 'Awareness' ? 'bg-gray-100 text-gray-800' :
                                                        item.stage === 'Interest' ? 'bg-blue-100 text-blue-800' :
                                                        item.stage === 'Desire' ? 'bg-yellow-100 text-yellow-800' :
                                                        item.stage === 'Action' ? 'bg-green-100 text-green-800' :
                                                        'bg-gray-100 text-gray-800'
                                                    }`}>
                                                        {item.stage || 'Awareness'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-2">
                                                    <span className={`inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full ${getLifecycleBadgeColor(item.status || 'Potential')}`}>
                                                        {item.status || 'Potential'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">Sales Pipeline</h1>
                    <p className="text-sm text-gray-600 mt-1">Track deals through AIDA framework</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => {
                            schedulePipelineRefresh();
                        }}
                        className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition text-sm font-medium"
                    >
                        <i className="fas fa-sync-alt mr-2"></i>
                        Refresh
                    </button>
                </div>
            </div>

            {usingCachedOpportunities && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2 rounded-lg">
                    <i className="fas fa-bolt text-amber-600"></i>
                    <span>
                        Showing cached opportunities instantly while fresh stages load from the server.
                    </span>
                </div>
            )}

            {/* View Toggle & Filters */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 space-y-4">
                {/* Search and Filters */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-5">
                    {/* Search Bar */}
                    <div className="sm:col-span-2 lg:col-span-1">
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Search by name, industry, contact, or services..."
                                value={filters.search}
                                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                                className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-colors bg-gray-50 focus:bg-white"
                            />
                            <i className="fas fa-search absolute left-3 top-3.5 text-sm text-gray-400"></i>
                            {filters.search && (
                                <button
                                    onClick={() => setFilters({ ...filters, search: '' })}
                                    className="absolute right-3 top-3.5 transition-colors text-gray-400 hover:text-gray-600"
                                    title="Clear search"
                                >
                                    <i className="fas fa-times text-sm"></i>
                                </button>
                            )}
                        </div>
                    </div>
                    
                    {/* Industry Filter */}
                    <div>
                        <select
                            value={filters.industry}
                            onChange={(e) => setFilters({ ...filters, industry: e.target.value })}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-colors bg-gray-50 focus:bg-white"
                        >
                            <option value="All">All Industries</option>
                            <option value="Mining">Mining</option>
                            <option value="Mining Contractor">Mining Contractor</option>
                            <option value="Forestry">Forestry</option>
                            <option value="Agriculture">Agriculture</option>
                            <option value="Diesel Supply">Diesel Supply</option>
                            <option value="Logistics">Logistics</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    
                    {/* Status Filter */}
                    <div>
                        <select
                            value={filters.status}
                            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-colors bg-gray-50 focus:bg-white"
                        >
                            <option value="All">All Status</option>
                            {statusOptions.map(status => (
                                <option key={status} value={status}>{status}</option>
                            ))}
                        </select>
                    </div>
                    
                    {/* AIDA Stage Filter */}
                    <div>
                        <select
                            value={filters.stage}
                            onChange={(e) => setFilters({ ...filters, stage: e.target.value })}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-colors bg-gray-50 focus:bg-white"
                        >
                            <option value="All">All Stages</option>
                            <option value="Awareness">Awareness</option>
                            <option value="Interest">Interest</option>
                            <option value="Desire">Desire</option>
                            <option value="Action">Action</option>
                        </select>
                    </div>
                    
                    {/* Starred Only Checkbox */}
                    <div className="flex items-center">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={showStarredOnly}
                                onChange={(e) => setShowStarredOnly(e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">
                                <i className="fas fa-star text-yellow-500 mr-1"></i>
                                Starred Only
                            </span>
                        </label>
                    </div>
                </div>

                {/* View Toggle & Kanban Options */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-200 flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">View:</span>
                        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                            <button
                                onClick={() => setViewMode('list')}
                                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                    viewMode === 'list'
                                        ? 'bg-white text-gray-900 shadow-sm'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                <i className="fas fa-list mr-1.5"></i>
                                List
                            </button>
                            <button
                                onClick={() => setViewMode('kanban')}
                                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                                    viewMode === 'kanban'
                                        ? 'bg-white text-gray-900 shadow-sm'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                <i className="fas fa-columns mr-1.5"></i>
                                Kanban
                            </button>
                        </div>
                        {viewMode === 'kanban' && (
                            <div className="flex items-center gap-2 ml-4">
                                <span className="text-sm text-gray-600">Group by:</span>
                                <select
                                    value={kanbanGroupBy}
                                    onChange={(e) => setKanbanGroupBy(e.target.value)}
                                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="stage">AIDA Stage</option>
                                    <option value="status">Status</option>
                                </select>
                            </div>
                        )}
                    </div>
                    {viewMode === 'list' && (
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600">Sort by:</span>
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="value-desc">Value: High to Low</option>
                                <option value="value-asc">Value: Low to High</option>
                                <option value="date-desc">Newest First</option>
                                <option value="date-asc">Oldest First</option>
                                <option value="name-asc">Name: A to Z</option>
                                <option value="name-desc">Name: Z to A</option>
                            </select>
                        </div>
                    )}
                </div>

                {/* Active Filters Count */}
                {(filters.search || 
                  filters.industry !== 'All' || filters.status !== 'All' || filters.stage !== 'All' || showStarredOnly) && (
                    <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                            <span>
                                {(() => {
                                    const searchSuffix = filters.search ? ` matching "${filters.search}"` : '';
                                    return `Showing ${filteredItems.length} of ${getPipelineItems().length} deals${searchSuffix}`;
                                })()}
                            </span>
                        </div>
                        <button
                            onClick={() => {
                                setFilters({
                                    search: '',
                                    minValue: '',
                                    maxValue: '',
                                    industry: 'All',
                                    status: 'All',
                                    stage: 'All',
                                    source: 'All'
                                });
                                setShowStarredOnly(false);
                            }}
                            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                            Clear all filters
                        </button>
                    </div>
                )}
            </div>

            {/* Main Content - List or Kanban View */}
            {viewMode === 'list' ? (
                <ListView />
            ) : (
                <KanbanView 
                    items={filteredItems}
                    groupBy={kanbanGroupBy}
                    pipelineStages={pipelineStages}
                    statusOptions={statusOptions}
                    onItemClick={openDealDetail}
                    onItemDragStart={handleDragStart}
                    onItemDragEnd={handleDragEnd}
                    onItemDrop={handleKanbanDrop}
                    onToggleStar={handleToggleStar}
                    normalizeStageToAida={normalizeStageToAida}
                    normalizeLifecycleStage={normalizeLifecycleStage}
                    formatCurrency={formatCurrency}
                    getLifecycleBadgeColor={getLifecycleBadgeColor}
                    draggedItem={draggedItem}
                    draggedOverStage={draggedOverStage}
                    setDraggedOverStage={setDraggedOverStage}
                />
            )}

            {/* Fallback detail modals when integration callbacks are unavailable */}
            {!onOpenLead && fallbackDeal?.type === 'lead' && LeadDetailModalComponent && (
                <LeadDetailModalComponent
                    key={`fallback-lead-${fallbackDeal.id}`}
                    leadId={fallbackDeal.id}
                    onClose={() => closeFallbackDetail(true)}
                    allProjects={availableProjects}
                    isFullPage={false}
                />
            )}

            {!onOpenOpportunity && fallbackDeal?.type === 'opportunity' && OpportunityDetailModalComponent && (
                <OpportunityDetailModalComponent
                    key={`fallback-opp-${fallbackDeal.id}`}
                    opportunityId={fallbackDeal.id}
                    client={fallbackDeal.client}
                    onClose={() => closeFallbackDetail(true)}
                    isFullPage={false}
                />
            )}

            {(fallbackDeal?.type === 'lead' && !LeadDetailModalComponent && !onOpenLead) && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999]">
                    <div className="bg-white rounded-xl p-6 shadow-2xl max-w-md text-center space-y-4">
                        <div className="text-primary-600 text-3xl">
                            <i className="fas fa-exclamation-triangle"></i>
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900">Lead detail unavailable</h3>
                        <p className="text-sm text-gray-600">
                            The lead detail component has not finished loading. Please refresh the page and try again.
                        </p>
                        <button
                            type="button"
                            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
                            onClick={() => closeFallbackDetail(false)}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}

            {(fallbackDeal?.type === 'opportunity' && !OpportunityDetailModalComponent && !onOpenOpportunity) && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999]">
                    <div className="bg-white rounded-xl p-6 shadow-2xl max-w-md text-center space-y-4">
                        <div className="text-primary-600 text-3xl">
                            <i className="fas fa-exclamation-triangle"></i>
                        </div>
                        <h3 className="text-lg font-semibold text-gray-900">Opportunity detail unavailable</h3>
                        <p className="text-sm text-gray-600">
                            The opportunity detail component has not finished loading. Please refresh the page and try again.
                        </p>
                        <button
                            type="button"
                            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
                            onClick={() => closeFallbackDetail(false)}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

window.Pipeline = Pipeline;
// Also set PipelineView for compatibility with Clients.jsx
window.PipelineView = Pipeline;

try {
    window.dispatchEvent(new Event('pipeline:component-ready'));
} catch (error) {
    console.warn('⚠️ Pipeline: Unable to dispatch component-ready event', error);
}
