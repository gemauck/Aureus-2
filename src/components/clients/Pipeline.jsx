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
        case 'tender':
            return 'Tender';
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

const Pipeline = ({ onOpenLead, onOpenOpportunity, onOpenClient }) => {
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
    // Load view mode from localStorage, defaulting to 'list' if not set
    const [viewMode, setViewMode] = useState(() => {
        try {
            const saved = localStorage.getItem('pipelineViewMode');
            return saved === 'kanban' || saved === 'list' ? saved : 'list';
        } catch (e) {
            return 'list';
        }
    });
    const [kanbanGroupBy, setKanbanGroupBy] = useState('stage'); // 'stage' (AIDA) or 'status'
    const [refreshKey, setRefreshKey] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [touchDragState, setTouchDragState] = useState(null); // { item, type, startY, currentY, targetStage }
    const [mouseDragState, setMouseDragState] = useState(null); // Mouse-based drag state
    const [justDragged, setJustDragged] = useState(false); // Track if we just completed a drag to prevent accidental clicks
    const [draggedOverStage, setDraggedOverStage] = useState(null);
    const [dataLoaded, setDataLoaded] = useState(false); // Track when data is fully loaded from API
    const [fallbackDeal, setFallbackDeal] = useState(null); // { type: 'lead' | 'opportunity', id, data, client }
    const [listSortColumn, setListSortColumn] = useState('name'); // Default to alphabetical by name
    const [listSortDirection, setListSortDirection] = useState('asc');
    const [usingCachedOpportunities, setUsingCachedOpportunities] = useState(false);
    const [listPage, setListPage] = useState(1);
    const [listPageSize, setListPageSize] = useState(() => {
        try {
            const saved = parseInt(localStorage.getItem('pipelineListPageSize'), 10);
            return [25, 50, 100].includes(saved) ? saved : 25;
        } catch (e) {
            return 25;
        }
    });
    
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

    // Persist view mode preference to localStorage
    useEffect(() => {
        try {
            localStorage.setItem('pipelineViewMode', viewMode);
        } catch (error) {
            console.warn('⚠️ Pipeline: Failed to save view mode preference:', error);
        }
    }, [viewMode]);

    // Persist list page size to localStorage
    useEffect(() => {
        try {
            localStorage.setItem('pipelineListPageSize', String(listPageSize));
        } catch (error) {
            console.warn('⚠️ Pipeline: Failed to save list page size:', error);
        }
    }, [listPageSize]);

    // Reset to page 1 when filters or sort change
    useEffect(() => {
        setListPage(1);
    }, [filters.search, filters.industry, filters.status, filters.stage, filters.source, showStarredOnly, listSortColumn, listSortDirection]);

    const normalizeLifecycleStage = useCallback(normalizeLifecycleStageValue, []);

    const statusOptions = useMemo(() => {
        // Start with all possible statuses to ensure they're always available
        const statuses = new Set(['Active', 'Potential', 'Proposal', 'Tender', 'Disinterested']);

        // Also include any statuses found in the data (normalized)
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
    }, [clients, leads, normalizeLifecycleStage]);

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
            id: 'no-engagement', 
            name: 'No Engagement', 
            icon: 'fa-minus-circle',
            color: 'slate',
            description: 'No response or engagement yet',
            avgDuration: '-'
        },
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
    const aidaStages = ['No Engagement', 'Awareness', 'Interest', 'Desire', 'Action'];
    const aidaStageIds = ['no engagement', 'awareness', 'interest', 'desire', 'action'];
    
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
                } else {
                    // Preserve cached clients when API fails so pipeline doesn't go empty
                    apiClients = normalizedCachedClients;
                    if (normalizedCachedClients.length > 0) {
                        console.warn('⚠️ Pipeline: Failed to load clients from API, using cached clients');
                    }
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
                } else {
                    // Preserve cached leads when API fails so pipeline doesn't go empty
                    apiLeads = normalizedCachedLeads;
                    if (normalizedCachedLeads.length > 0) {
                        console.warn('⚠️ Pipeline: Failed to load leads from API, using cached leads');
                    }
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

                // Preserve clientSites/sites when API returns leads without them (e.g. fallback query)
                // so Pipeline site cards don't appear then disappear after API load
                const leadsWithSitesPreserved = apiLeads.map((apiLead) => {
                    const hasSites = Array.isArray(apiLead.clientSites) && apiLead.clientSites.length > 0 ||
                        Array.isArray(apiLead.sites) && apiLead.sites.length > 0;
                    if (hasSites) return apiLead;
                    const cachedLead = normalizedCachedLeads.find(
                        (c) => getComparableId(c.id) === getComparableId(apiLead.id)
                    );
                    const prevSites = cachedLead && (cachedLead.clientSites || cachedLead.sites);
                    if (Array.isArray(prevSites) && prevSites.length > 0) {
                        return { ...apiLead, clientSites: prevSites, sites: prevSites };
                    }
                    return apiLead;
                });

                setClients(finalClients);
                setLeads(leadsWithSitesPreserved);

                if (typeof storage?.setClients === 'function') {
                    storage.setClients(finalClients);
                }

                if (typeof storage?.setLeads === 'function') {
                    storage.setLeads(leadsWithSitesPreserved);
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

        const siteItems = [];
        // Lead sites: only include sites marked as Lead (siteType !== 'client'); default missing siteType to 'lead' for backward compat
        leads.forEach(lead => {
            const sites = lead.clientSites || lead.sites || [];
            const siteList = Array.isArray(sites) ? sites : [];
            siteList.forEach((site, idx) => {
                if (!site || typeof site !== 'object') return;
                if (site.siteType === 'client') return; // Client sites do not show in Pipeline
                const siteStage = site.stage || site.aidaStatus || lead.stage;
                const mappedStage = normalizeStageToAida(siteStage);
                const siteId = site.id || `site-${lead.id}-${idx}`;
                const pipelineId = `lead-${lead.id}-site-${siteId}`;
                const leadName = lead.name || lead.company || 'Lead';
                const siteName = site.name || 'Unnamed site';
                siteItems.push({
                    id: pipelineId,
                    type: 'site',
                    itemType: 'Site',
                    name: `${leadName} · ${siteName}`,
                    stage: mappedStage,
                    status: normalizeLifecycleStage(site.stage || lead.status),
                    isStarred: Boolean(lead.isStarred),
                    value: 0,
                    createdDate: site.createdAt || lead.createdDate || new Date().toISOString(),
                    expectedCloseDate: null,
                    industry: lead.industry || 'Other',
                    leadId: lead.id,
                    lead,
                    site,
                    siteId: site.id || null,
                    siteIndex: idx,
                    raw: { site, lead }
                });
            });
        });
        // Client sites marked as Lead: show in Pipeline until marked as Client
        clients.forEach(client => {
            const sites = client.clientSites || client.sites || [];
            const siteList = Array.isArray(sites) ? sites : [];
            siteList.forEach((site, idx) => {
                if (!site || typeof site !== 'object') return;
                if (site.siteType === 'client') return; // Only client-type sites are excluded; lead or missing = show in Pipeline
                const siteStage = site.stage || site.aidaStatus || 'Awareness';
                const mappedStage = normalizeStageToAida(siteStage);
                const siteId = site.id || `site-${client.id}-${idx}`;
                const pipelineId = `client-${client.id}-site-${siteId}`;
                const clientName = client.name || 'Client';
                const siteName = site.name || 'Unnamed site';
                siteItems.push({
                    id: pipelineId,
                    type: 'site',
                    itemType: 'Site',
                    name: `${clientName} · ${siteName}`,
                    stage: mappedStage,
                    status: normalizeLifecycleStage(site.stage || 'Potential'),
                    isStarred: Boolean(client.isStarred),
                    value: 0,
                    createdDate: site.createdAt || client.createdDate || new Date().toISOString(),
                    expectedCloseDate: null,
                    industry: client.industry || 'Other',
                    clientId: client.id,
                    client,
                    site,
                    siteId: site.id || null,
                    siteIndex: idx,
                    raw: { site, client }
                });
            });
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

        return [...leadItems, ...siteItems, ...opportunityItems];
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
                    return (a, b) => directionMultiplier * (a.name || '').localeCompare((b.name || ''), undefined, { sensitivity: 'base' });
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
                        const stageOrder = { 'No Engagement': 0, 'Awareness': 1, 'Interest': 2, 'Desire': 3, 'Action': 4 };
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
                    return (a, b) => (a.name || '').localeCompare((b.name || ''), undefined, { sensitivity: 'base' });
                case 'name-desc':
                    return (a, b) => (b.name || '').localeCompare((a.name || ''), undefined, { sensitivity: 'base' });
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

    // List view: nest sites under their lead (or client). Sorted alphabetically by primary name across all types (leads, opportunities, clients).
    const getNestedListRows = () => {
        const items = getFilteredItems();
        const leads = items.filter(i => i.type === 'lead');
        const siteItems = items.filter(i => i.type === 'site');
        const opportunities = items.filter(i => i.type === 'opportunity');
        const nameKey = (item) => (item && item.name) ? String(item.name).toLowerCase().trim() : '';
        const dir = listSortDirection === 'desc' ? -1 : 1;
        const cmp = (a, b) => dir * (nameKey(a).localeCompare(nameKey(b), undefined, { sensitivity: 'base' }));

        // Lead blocks: lead + its sites (sites sorted by name within block)
        const leadBlocks = leads.slice().sort(cmp).map(lead => {
            const leadRow = { item: lead, isNested: false, parentName: null, parentLabel: null };
            const leadSites = siteItems
                .filter(s => (s.leadId || s.lead?.id) === lead.id)
                .slice()
                .sort((a, b) => nameKey(a).localeCompare(nameKey(b), undefined, { sensitivity: 'base' }));
            const siteRows = leadSites.map(site => ({
                item: site,
                isNested: true,
                parentName: lead.name || lead.company || 'Lead',
                parentLabel: 'Lead'
            }));
            return [leadRow, ...siteRows];
        });

        // Opportunity blocks: one row each, sorted by name
        const oppBlocks = opportunities.slice().sort(cmp).map(opp => [
            { item: opp, isNested: false, parentName: null, parentLabel: null }
        ]);

        // Client-site blocks: client row + sites (sites sorted by name within block)
        const clientSites = siteItems.filter(s => s.clientId && !(s.leadId || s.lead?.id));
        const clientIds = [...new Set(clientSites.map(s => s.clientId).filter(Boolean))];
        const clientBlocks = clientIds.map(clientId => {
            const sites = clientSites.filter(s => s.clientId === clientId);
            const first = sites[0];
            const client = first?.client || first?.raw?.client || { id: clientId, name: 'Client' };
            const parentName = client.name || 'Client';
            const clientRowItem = {
                type: 'client',
                id: clientId,
                name: parentName,
                stage: client.stage || 'Awareness',
                status: client.status || 'Potential',
                isStarred: Boolean(client.isStarred),
                client
            };
            const clientRow = { item: clientRowItem, isNested: false, parentName: null, parentLabel: null };
            const siteRows = sites
                .slice()
                .sort((a, b) => nameKey(a).localeCompare(nameKey(b), undefined, { sensitivity: 'base' }))
                .map(site => ({ item: site, isNested: true, parentName, parentLabel: 'Client' }));
            return [clientRow, ...siteRows];
        });
        clientBlocks.sort((blockA, blockB) => cmp(blockA[0].item, blockB[0].item));

        // Merge all blocks and sort by primary row name (alphabetical across leads, opportunities, clients)
        const allBlocks = [...leadBlocks, ...oppBlocks, ...clientBlocks];
        allBlocks.sort((blockA, blockB) => cmp(blockA[0].item, blockB[0].item));
        return allBlocks.flat();
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
            if (typeof storage?.setLeads === 'function') storage.setLeads(updated);
            try { window.dispatchEvent(new CustomEvent('pipelineLeadsClientsUpdated', { detail: { leads: updated } })); } catch (_) {}
            return updated;
        });

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
            if (typeof storage?.setClients === 'function') storage.setClients(updated);
            try { window.dispatchEvent(new CustomEvent('pipelineLeadsClientsUpdated', { detail: { clients: updated } })); } catch (_) {}
            return updated;
        });

        return snapshot;
    };

    const STAGE_OPTIONS = ['No Engagement', 'Awareness', 'Interest', 'Desire', 'Action'];
    const STATUS_OPTIONS = ['Potential', 'Active', 'Inactive', 'On Hold', 'Qualified', 'Disinterested', 'Proposal', 'Tender'];

    const handlePipelineStageChange = useCallback(async (item, newStage) => {
        const token = storage?.getToken?.();
        const normalized = STAGE_OPTIONS.find(s => s.toLowerCase() === (newStage || '').toLowerCase()) || 'Awareness';
        try {
            if (item.type === 'lead') {
                if (token && (window.DatabaseAPI?.updateLead || window.api?.updateLead)) {
                    await (window.api?.updateLead || window.DatabaseAPI.updateLead)(item.id, { stage: normalized });
                }
                updateLeadStageOptimistically(item.id, normalized);
            } else if (item.type === 'site') {
                const clientId = item.leadId || item.lead?.id || item.clientId;
                const siteId = item.siteId || item.site?.id;
                const hasSiteId = clientId && siteId && (window.api?.updateSite || window.DatabaseAPI?.makeRequest);
                const hasIndexFallback = typeof item.siteIndex === 'number' && clientId && token;
                if (hasSiteId && token) {
                    await (window.api?.updateSite
                        ? window.api.updateSite(clientId, siteId, { aidaStatus: normalized, stage: item.status || 'Potential' })
                        : window.DatabaseAPI.makeRequest(`/sites/client/${clientId}/${siteId}`, { method: 'PATCH', body: JSON.stringify({ aidaStatus: normalized, stage: item.status || 'Potential' }) }));
                } else if (hasIndexFallback && !hasSiteId && (window.api?.updateLead || window.DatabaseAPI?.makeRequest) && (item.leadId || item.lead?.id)) {
                    const leadId = item.leadId || item.lead?.id;
                    const lead = (storage?.getLeads?.() || []).find(l => String(l.id) === String(leadId)) || leads.find(l => String(l.id) === String(leadId));
                    if (lead) {
                        const sites = lead.clientSites || lead.sites || [];
                        const idx = item.siteIndex;
                        if (Array.isArray(sites) && idx >= 0 && idx < sites.length) {
                            const updatedSites = sites.map((s, i) => i === idx ? { ...s, aidaStatus: normalized } : s);
                            await (window.api?.updateLead || window.DatabaseAPI.updateLead)(leadId, { sites: updatedSites });
                        }
                    }
                } else if (hasIndexFallback && !hasSiteId && item.clientId && (window.api?.updateClient || window.DatabaseAPI?.makeRequest)) {
                    const client = (storage?.getClients?.() || []).find(c => String(c.id) === String(item.clientId)) || clients.find(c => String(c.id) === String(item.clientId));
                    if (client) {
                        const sites = client.clientSites || client.sites || [];
                        const idx = item.siteIndex;
                        if (Array.isArray(sites) && idx >= 0 && idx < sites.length) {
                            const updatedSites = sites.map((s, i) => i === idx ? { ...s, aidaStatus: normalized } : s);
                            await (window.api?.updateClient || window.DatabaseAPI.updateClient)(item.clientId, { clientSites: updatedSites });
                        }
                    }
                }
                if (item.leadId || item.lead?.id) {
                    setLeads(prev => {
                        const parentId = item.leadId || item.lead?.id;
                        const updated = prev.map(lead => {
                            if (String(lead.id) !== String(parentId)) return lead;
                            const sites = lead.clientSites || lead.sites || [];
                            const matchByIndex = typeof item.siteIndex === 'number' && (siteId == null || siteId === '');
                            const newSites = sites.map((s, i) => {
                                if (matchByIndex && i === item.siteIndex) return { ...s, aidaStatus: normalized };
                                if (String(s.id) === String(siteId) || s.id === siteId) return { ...s, aidaStatus: normalized };
                                return s;
                            });
                            return { ...lead, clientSites: newSites.length ? newSites : undefined, sites: newSites };
                        });
                        if (typeof storage?.setLeads === 'function') storage.setLeads(updated);
                        try { window.dispatchEvent(new CustomEvent('pipelineLeadsClientsUpdated', { detail: { leads: updated } })); } catch (_) {}
                        return updated;
                    });
                } else if (item.clientId) {
                    setClients(prev => {
                        const updated = prev.map(client => {
                            if (String(client.id) !== String(item.clientId)) return client;
                            const sites = client.clientSites || client.sites || [];
                            const matchByIndex = typeof item.siteIndex === 'number' && (siteId == null || siteId === '');
                            const newSites = sites.map((s, i) => {
                                if (matchByIndex && i === item.siteIndex) return { ...s, aidaStatus: normalized };
                                if (String(s.id) === String(siteId) || s.id === siteId) return { ...s, aidaStatus: normalized };
                                return s;
                            });
                            return { ...client, clientSites: newSites.length ? newSites : undefined, sites: newSites };
                        });
                        if (typeof storage?.setClients === 'function') storage.setClients(updated);
                        try { window.dispatchEvent(new CustomEvent('pipelineLeadsClientsUpdated', { detail: { clients: updated } })); } catch (_) {}
                        return updated;
                    });
                }
            } else if (item.type === 'opportunity') {
                if (token && (window.api?.updateOpportunity || window.DatabaseAPI?.updateOpportunity)) {
                    await (window.api?.updateOpportunity || window.DatabaseAPI.updateOpportunity)(item.id, { stage: normalized });
                }
                updateOpportunityStageOptimistically(item.clientId, item.id, normalized);
            }
        } catch (err) {
            console.error('❌ Pipeline: Failed to save stage:', err);
            alert('Failed to save stage. Please try again.');
            return;
        }
    }, [storage, updateLeadStageOptimistically, updateOpportunityStageOptimistically, leads, clients]);

    const handlePipelineStatusChange = useCallback(async (item, newStatus) => {
        const token = storage?.getToken?.();
        const normalized = normalizeLifecycleStage(newStatus) || 'Potential';
        try {
            if (item.type === 'lead') {
                if (token && (window.DatabaseAPI?.updateLead || window.api?.updateLead)) {
                    await (window.api?.updateLead || window.DatabaseAPI.updateLead)(item.id, { status: normalized });
                }
                setLeads(prev => {
                    const updated = prev.map(lead => lead.id === item.id ? { ...lead, status: normalized } : lead);
                    if (typeof storage?.setLeads === 'function') storage.setLeads(updated);
                    try { window.dispatchEvent(new CustomEvent('pipelineLeadsClientsUpdated', { detail: { leads: updated } })); } catch (_) {}
                    return updated;
                });
            } else if (item.type === 'site') {
                const clientId = item.leadId || item.lead?.id || item.clientId;
                const siteId = item.siteId || item.site?.id;
                if (clientId && siteId && token && (window.api?.updateSite || window.DatabaseAPI?.makeRequest)) {
                    await (window.api?.updateSite
                        ? window.api.updateSite(clientId, siteId, { stage: normalized, aidaStatus: item.stage || 'Awareness' })
                        : window.DatabaseAPI.makeRequest(`/sites/client/${clientId}/${siteId}`, { method: 'PATCH', body: JSON.stringify({ stage: normalized, aidaStatus: item.stage || 'Awareness' }) }));
                }
                if (item.leadId || item.lead?.id) {
                    setLeads(prev => {
                        const parentId = item.leadId || item.lead?.id;
                        const updated = prev.map(lead => {
                            if (String(lead.id) !== String(parentId)) return lead;
                            const sites = lead.clientSites || lead.sites || [];
                            const matchByIndex = typeof item.siteIndex === 'number' && (siteId == null || siteId === '');
                            const newSites = sites.map((s, i) => {
                                if (matchByIndex && i === item.siteIndex) return { ...s, stage: normalized };
                                if (String(s.id) === String(siteId) || s.id === siteId) return { ...s, stage: normalized };
                                return s;
                            });
                            return { ...lead, clientSites: newSites.length ? newSites : undefined, sites: newSites };
                        });
                        if (typeof storage?.setLeads === 'function') storage.setLeads(updated);
                        try { window.dispatchEvent(new CustomEvent('pipelineLeadsClientsUpdated', { detail: { leads: updated } })); } catch (_) {}
                        return updated;
                    });
                } else if (item.clientId) {
                    setClients(prev => {
                        const updated = prev.map(client => {
                            if (String(client.id) !== String(item.clientId)) return client;
                            const sites = client.clientSites || client.sites || [];
                            const matchByIndex = typeof item.siteIndex === 'number' && (siteId == null || siteId === '');
                            const newSites = sites.map((s, i) => {
                                if (matchByIndex && i === item.siteIndex) return { ...s, stage: normalized };
                                if (String(s.id) === String(siteId) || s.id === siteId) return { ...s, stage: normalized };
                                return s;
                            });
                            return { ...client, clientSites: newSites.length ? newSites : undefined, sites: newSites };
                        });
                        if (typeof storage?.setClients === 'function') storage.setClients(updated);
                        try { window.dispatchEvent(new CustomEvent('pipelineLeadsClientsUpdated', { detail: { clients: updated } })); } catch (_) {}
                        return updated;
                    });
                }
            } else if (item.type === 'opportunity') {
                if (token && (window.api?.updateOpportunity || window.DatabaseAPI?.updateOpportunity)) {
                    await (window.api?.updateOpportunity || window.DatabaseAPI.updateOpportunity)(item.id, { status: normalized });
                }
                setClients(prev => {
                    const updated = prev.map(client => {
                        if (client.id !== item.clientId) return client;
                        const opps = (client.opportunities || []).map(opp => opp.id === item.id ? { ...opp, status: normalized } : opp);
                        return { ...client, opportunities: opps };
                    });
                    if (typeof storage?.setClients === 'function') storage.setClients(updated);
                    try { window.dispatchEvent(new CustomEvent('pipelineLeadsClientsUpdated', { detail: { clients: updated } })); } catch (_) {}
                    return updated;
                });
            }
        } catch (err) {
            console.error('❌ Pipeline: Failed to save status:', err);
            alert('Failed to save status. Please try again.');
            return;
        }
    }, [storage, normalizeLifecycleStage]);

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
            
            // Don't refresh immediately - optimistic update already handled it
            // Only refresh on error to ensure data consistency
        } catch (error) {
            console.error('❌ Pipeline: Failed to update item in Kanban:', error);
            alert('Failed to save change. Please try again.');
            // Refresh on error to get latest data
            setTimeout(() => {
                setRefreshKey(k => k + 1);
            }, 500);
        } finally {
            setDraggedItem(null);
            setDraggedType(null);
            setIsDragging(false);
            setDraggedOverStage(null);
        }
    };

    // Mouse-based drag handlers (fallback for when HTML5 drag doesn't work)
    // Use refs to avoid stale closures in drag handlers
    const dragStateRef = useRef(null);
    const dragGhostRef = useRef(null); // Separate ghost element that follows cursor

    const handleMouseDown = (e, item, type) => {
        // Don't interfere with button clicks
        if (e.target.closest('button')) {
            return;
        }
        
        // Don't prevent default immediately - wait to see if it's a drag or click
        console.log('🖱️ MouseDown triggered', { itemId: item.id });
        
        const cardElement = e.currentTarget;
        const cardRect = cardElement.getBoundingClientRect();
        
        // Calculate offset from mouse click point to card's top-left corner
        const offsetX = e.clientX - cardRect.left;
        const offsetY = e.clientY - cardRect.top;
        
        const dragState = {
            item,
            type,
            startX: e.clientX,
            startY: e.clientY,
            currentX: e.clientX,
            currentY: e.clientY,
            offsetX,
            offsetY,
            cardRect,
            initialStage: item.stage,
            cardElement,
            hasMoved: false,
            targetStage: null,
            wasClick: false
        };
        
        dragStateRef.current = dragState;
        
        // Mouse move handler - update ghost position IMMEDIATELY
        const mouseMoveHandler = (moveEvent) => {
            const state = dragStateRef.current;
            if (!state) {
                return;
            }
            
            // Check if we've moved enough to consider it a drag
            const deltaX = moveEvent.clientX - state.startX;
            const deltaY = moveEvent.clientY - state.startY;
            const minDragDistance = 5;
            
            // Only prevent default and create ghost once we start dragging
            if (!state.hasMoved && (Math.abs(deltaX) > minDragDistance || Math.abs(deltaY) > minDragDistance)) {
                state.hasMoved = true;
                moveEvent.preventDefault();
                moveEvent.stopPropagation();
                
                // Create ghost element only when dragging starts
                const ghost = document.createElement('div');
                ghost.id = 'pipeline-drag-ghost';
                ghost.innerHTML = cardElement.innerHTML;
                ghost.className = cardElement.className;
                
                // Apply styles directly - set each property individually
                ghost.style.position = 'fixed';
                ghost.style.left = `${cardRect.left}px`;
                ghost.style.top = `${cardRect.top}px`;
                ghost.style.width = `${cardRect.width}px`;
                ghost.style.zIndex = '99999';
                ghost.style.opacity = '0.9';
                ghost.style.pointerEvents = 'none';
                ghost.style.transform = 'rotate(2deg) scale(1.03)';
                ghost.style.boxShadow = '0 20px 40px rgba(0, 0, 0, 0.25), 0 8px 16px rgba(0, 0, 0, 0.15)';
                ghost.style.transition = 'none';
                ghost.style.cursor = 'grabbing';
                ghost.style.backgroundColor = 'white';
                ghost.style.borderRadius = '0.5rem';
                ghost.style.padding = '0.75rem';
                ghost.style.border = '1px solid #e5e7eb';
                
                document.body.appendChild(ghost);
                dragGhostRef.current = ghost;
                console.log('👻 Ghost element created and appended', ghost);
                
                // Make original card semi-transparent
                cardElement.style.opacity = '0.3';
                cardElement.style.transition = 'none';
                
                // Set drag state
                setMouseDragState(dragState);
                setDraggedItem(item);
                setDraggedType(type);
                setIsDragging(true);
            }
            
            if (!state.hasMoved) {
                return; // Not dragging yet, don't interfere
            }
            
            const ghostEl = dragGhostRef.current;
            if (!ghostEl) {
                return;
            }
            
            moveEvent.preventDefault();
            moveEvent.stopPropagation();
            
            // Calculate new position
            const newX = moveEvent.clientX - state.offsetX;
            const newY = moveEvent.clientY - state.offsetY;
            
            // Update ghost position - this is what the user sees moving
            ghostEl.style.left = `${newX}px`;
            ghostEl.style.top = `${newY}px`;
            
            console.log('🔄 MouseMove: Updating ghost position', { newX, newY, clientX: moveEvent.clientX, clientY: moveEvent.clientY });
            
            // Update current position tracking
            state.currentX = moveEvent.clientX;
            state.currentY = moveEvent.clientY;
            
            // Find which column we're over
            const elementBelow = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
            let columnName = null;
            
            if (elementBelow) {
                const columnContainer = elementBelow.closest('[class*="flex-shrink"]');
                if (columnContainer) {
                    const heading = columnContainer.querySelector('h3');
                    if (heading) {
                        columnName = heading.textContent?.trim();
                    }
                }
                if (!columnName) {
                    const dataColumn = elementBelow.closest('[data-column-name]');
                    if (dataColumn) {
                        columnName = dataColumn.dataset.columnName;
                    }
                }
            }
            
            if (columnName && columnName !== state.targetStage) {
                state.targetStage = columnName;
                setDraggedOverStage(columnName);
            }
        };
        
        // Mouse up handler
        const mouseUpHandler = async (upEvent) => {
            const state = dragStateRef.current;
            const ghostEl = dragGhostRef.current;
            
            // Remove event listeners
            document.removeEventListener('mousemove', mouseMoveHandler);
            document.removeEventListener('mouseup', mouseUpHandler);
            
            // Remove ghost element if it exists
            if (ghostEl && ghostEl.parentNode) {
                ghostEl.parentNode.removeChild(ghostEl);
            }
            dragGhostRef.current = null;
            
            // Restore original card
            if (state && state.cardElement) {
                state.cardElement.style.opacity = '';
                state.cardElement.style.transition = '';
            }
            
            if (!state) {
                dragStateRef.current = null;
                setMouseDragState(null);
                setDraggedItem(null);
                setDraggedType(null);
                setIsDragging(false);
                setDraggedOverStage(null);
                return;
            }
            
            const { item, type, targetStage, initialStage, hasMoved } = state;
            
            // If no movement occurred, it was a click - allow it to proceed
            if (!hasMoved) {
                // Reset state immediately so click handler can work
                dragStateRef.current = null;
                setMouseDragState(null);
                setDraggedItem(null);
                setDraggedType(null);
                setIsDragging(false);
                setDraggedOverStage(null);
                // Don't prevent default - let the click event fire
                return;
            }
            
            // Handle drop
            if (hasMoved && targetStage && targetStage !== initialStage) {
                setJustDragged(true);
                upEvent.preventDefault();
                upEvent.stopPropagation();
                
                const fakeEvent = {
                    preventDefault: () => {},
                    stopPropagation: () => {},
                    dataTransfer: {
                        getData: (key) => {
                            if (key === 'pipelineItemId') return String(item.id);
                            if (key === 'pipelineItemType') return String(type);
                            return '';
                        }
                    }
                };
                
                await handleKanbanDrop(fakeEvent, targetStage, kanbanGroupBy, item);
                setTimeout(() => setJustDragged(false), 300);
            }
            
            // Reset state
            dragStateRef.current = null;
            setMouseDragState(null);
            setDraggedItem(null);
            setDraggedType(null);
            setIsDragging(false);
            setDraggedOverStage(null);
        };
        
        // Add global listeners
        document.addEventListener('mousemove', mouseMoveHandler, { passive: false });
        document.addEventListener('mouseup', mouseUpHandler, { once: true });
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

        if (item.type === 'site') {
            const siteId = item.siteId || item.site?.id;
            const site = item.site;
            // Client site (from a client record): open client detail to Sites tab
            if (item.clientId || item.client) {
                const clientId = item.clientId || item.client?.id;
                const clientData = item.client || { id: clientId };
                if (clientId && typeof onOpenClient === 'function') {
                    onOpenClient({ clientId, clientData, siteId, site, origin: 'prop' });
                    return;
                }
                window.dispatchEvent(new CustomEvent('openClientDetailFromPipeline', { detail: { clientId, clientData, siteId, site, origin: 'event' } }));
                return;
            }
            // Lead site: open lead detail to Sites tab
            const resolvedLeadId = item.leadId || item.lead?.id;
            if (!resolvedLeadId) return;
            const payload = { leadId: resolvedLeadId, leadData: item.lead || { ...item, id: resolvedLeadId }, siteId: siteId || undefined };
            if (typeof onOpenLead === 'function') {
                onOpenLead({ ...payload, origin: 'prop' });
                return;
            }
            window.dispatchEvent(new CustomEvent('openLeadDetailFromPipeline', { detail: { ...payload, origin: 'event' } }));
            return;
        }

        if (item.type === 'client') {
            const clientId = item.id || item.client?.id;
            const clientData = item.client || item;
            if (clientId && typeof onOpenClient === 'function') {
                onOpenClient({ clientId, clientData, origin: 'prop' });
                return;
            }
            window.dispatchEvent(new CustomEvent('openClientDetailFromPipeline', { detail: { clientId, clientData, origin: 'event' } }));
            return;
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
                                className={`flex-shrink-0 w-72 sm:w-80 ${
                                    isDraggedOver ? 'ring-2 ring-blue-400 ring-opacity-50' : ''
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
                                    className={`${columnColorClasses} rounded-b-lg p-3 min-h-[500px] space-y-2 border-2 ${
                                        isDraggedOver 
                                            ? 'border-blue-400 border-dashed bg-blue-50/50' 
                                            : 'border-transparent hover:border-gray-200'
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
                                                    draggable="true"
                                                    onMouseDown={(e) => {
                                                        // Don't interfere with button clicks
                                                        if (e.target.closest('button')) {
                                                            return;
                                                        }
                                                        // Use mouse-based drag as primary method (HTML5 drag as fallback)
                                                        handleMouseDown(e, item, itemType);
                                                    }}
                                                    onDragStart={(e) => {
                                                        console.log('🎯 Drag start triggered', { itemId: item.id, target: e.target, currentTarget: e.currentTarget });
                                                        
                                                        // Prevent drag if clicking directly on button
                                                        if (e.target.tagName === 'BUTTON' || (e.target.closest('button') && e.target.closest('button') === e.target)) {
                                                            console.log('❌ Drag prevented - clicked directly on button');
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            return false;
                                                        }
                                                        
                                                        // Set dataTransfer data (like working KanbanView)
                                                        e.dataTransfer.setData('pipelineItemId', String(item.id));
                                                        e.dataTransfer.setData('pipelineItemType', String(itemType));
                                                        e.dataTransfer.effectAllowed = 'move';
                                                        
                                                        console.log('✅ Drag data set', { 
                                                            itemId: item.id, 
                                                            itemType,
                                                            dataTransferTypes: Array.from(e.dataTransfer.types)
                                                        });
                                                        
                                                        // Also call the handler for state management
                                                        if (onItemDragStart) {
                                                            onItemDragStart(e, item, itemType);
                                                        }
                                                    }}
                                                    onDragEnd={(e) => {
                                                        // Clear drag start time
                                                        if (e.currentTarget.dataset.dragStartTime) {
                                                            delete e.currentTarget.dataset.dragStartTime;
                                                        }
                                                        if (onItemDragEnd) {
                                                            onItemDragEnd(e);
                                                        }
                                                    }}
                                                    onClick={(e) => {
                                                        // Don't trigger card click if:
                                                        // 1. Clicking button
                                                        // 2. We just dragged (mouse or touch)
                                                        // 3. This item is currently being dragged
                                                        if (e.target.closest('button')) {
                                                            return;
                                                        }
                                                        if (justDragged) {
                                                            return;
                                                        }
                                                        if (isDragging && draggedItem?.id === item.id) {
                                                            return;
                                                        }
                                                        // Don't trigger if mouse drag is active for this item
                                                        if (mouseDragState?.item?.id === item.id && mouseDragState?.hasMoved) {
                                                            return;
                                                        }
                                                        if (onItemClick) {
                                                            onItemClick(item);
                                                        }
                                                    }}
                                                    className={`bg-white rounded-lg p-3 cursor-move border border-gray-200 hover:shadow-md hover:border-blue-300 select-none ${
                                                        isDragging && draggedItem?.id === item.id 
                                                            ? 'opacity-30' 
                                                            : mouseDragState?.item?.id === item.id
                                                            ? 'opacity-30'
                                                            : 'opacity-100'
                                                    }`}
                                                    style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                                                >
                                                    {/* Card Header */}
                                                    <div 
                                                        className="flex items-start justify-between mb-2 pointer-events-none"
                                                        draggable="false"
                                                        onDragStart={(e) => e.preventDefault()}
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                    >
                                                        <div className="flex-1 min-w-0" draggable="false" onDragStart={(e) => e.preventDefault()}>
                                                            <h4 
                                                                className="text-sm font-semibold text-gray-900 truncate pointer-events-none"
                                                                draggable="false"
                                                                onDragStart={(e) => e.preventDefault()}
                                                            >
                                                                {itemType === 'site' ? (item.site?.name || item.name?.split?.(' · ')?.[1] || itemName) : itemName}
                                                            </h4>
                                                            {itemType === 'site' && (item.lead?.name || item.client?.name || item.name?.split?.(' · ')?.[0]) && (
                                                                <p 
                                                                    className="text-xs text-gray-600 mt-0.5 truncate pointer-events-none"
                                                                    draggable="false"
                                                                    onDragStart={(e) => e.preventDefault()}
                                                                >
                                                                    {item.leadId ? 'Lead: ' : 'Client: '}{item.lead?.name || item.client?.name || item.name?.split?.(' · ')?.[0]}
                                                                </p>
                                                            )}
                                                            {itemIndustry && (
                                                                <p 
                                                                    className="text-xs text-gray-500 mt-0.5 truncate pointer-events-none"
                                                                    draggable="false"
                                                                    onDragStart={(e) => e.preventDefault()}
                                                                >
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
                                                            onMouseDown={(e) => {
                                                                e.stopPropagation();
                                                                e.preventDefault();
                                                            }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                e.preventDefault();
                                                                if (onToggleStar) {
                                                                    onToggleStar(e, item);
                                                                }
                                                            }}
                                                            className={`ml-2 flex-shrink-0 transition-colors cursor-pointer pointer-events-auto ${
                                                                item.isStarred 
                                                                    ? 'text-yellow-500' 
                                                                    : 'text-gray-300 hover:text-yellow-400'
                                                            }`}
                                                        >
                                                            <i className={`fas fa-star text-sm ${item.isStarred ? 'fas' : 'far'}`}></i>
                                                        </button>
                                                    </div>

                                                    {/* Card Body - Minimal Info */}
                                                    <div 
                                                        className="space-y-1.5 pointer-events-none"
                                                        draggable="false"
                                                        onDragStart={(e) => e.preventDefault()}
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                    >
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
                                                                    : itemType === 'site'
                                                                    ? 'bg-amber-100 text-amber-700'
                                                                    : 'bg-purple-100 text-purple-700'
                                                            }`}>
                                                                {itemType === 'lead' ? 'Lead' : itemType === 'site' ? 'Site' : 'Opportunity'}
                                                            </span>
                                                            
                                                            {/* Show opposite grouping as badge */}
                                                            {groupBy === 'stage' && (
                                                                <span className={`px-2 py-0.5 text-[10px] rounded-full ${getLifecycleBadgeColor(itemStatus)}`}>
                                                                    {normalizeLifecycleStage(itemStatus)}
                                                                </span>
                                                            )}
                                                            {groupBy === 'status' && (
                                                                <span className={`px-2 py-0.5 text-[10px] rounded-full ${
                                                                    itemStage === 'No Engagement' ? 'bg-slate-100 text-slate-800' :
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
                    if (wasDraggedRef.current || justDragged) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                    }
                    if (isDragging && draggedItem?.id === item.id) {
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
                            item.type === 'lead' ? 'bg-blue-50 text-blue-600' : item.type === 'site' ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'
                        }`}
                    >
                        {item.type === 'lead' ? 'Lead' : item.type === 'site' ? 'Site' : 'Opportunity'}
                    </span>
                </div>

                <p className="text-xs text-gray-500 truncate">
                    {item.type === 'site' ? (item.lead?.name || item.clientName) : (item.clientName || item.company || 'No company')}
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

    // Combined Deals List View (sites nested under their lead)
    const ListView = () => {
        const allRows = getNestedListRows();
        const totalRows = allRows.length;
        const totalPages = Math.max(1, Math.ceil(totalRows / listPageSize));
        const currentPage = Math.min(listPage, totalPages);
        const start = (currentPage - 1) * listPageSize;
        const rows = allRows.slice(start, start + listPageSize);
        useEffect(() => {
            if (totalPages > 0 && listPage > totalPages) {
                setListPage(totalPages);
            }
        }, [totalPages, listPage]);

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
        }, [viewMode, rows.length, listSortColumn, listSortDirection]);

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
                                {rows.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="px-4 py-12 text-center text-sm text-gray-500">
                                            <i className="fas fa-list-ul text-3xl text-gray-300 mb-3"></i>
                                            <p>No leads or opportunities match your filters.</p>
                                            <p className="text-xs text-gray-400 mt-1">Adjust filters to see more results.</p>
                                        </td>
                                    </tr>
                                ) : (
                                    rows.map((row, rowIndex) => {
                                        const { item, isNested, parentName, parentLabel } = row;
                                        const isLead = item.type === 'lead';
                                        const isSite = item.type === 'site';
                                        const isClient = item.type === 'client';

                                        const rowPadding = isNested ? 'py-1' : 'py-2';
                                        return (
                                            <tr
                                                key={`${item.type}-${item.id}`}
                                                className={`hover:bg-gray-50 cursor-pointer transition ${isNested ? 'bg-gray-50/50' : ''}`}
                                                onClick={() => openDealDetail(item)}
                                            >
                                                <td className={`${rowPadding} ${isNested ? 'pl-12 pr-6 border-l-4 border-l-amber-200' : 'px-6'}`}>
                                                    <div className="flex items-center gap-3">
                                                        {!isNested && (
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
                                                        )}
                                                        {isNested && <span className="w-7 shrink-0" aria-hidden />}
                                                        <div className="min-w-0">
                                                            <span className={`font-medium text-gray-900 block ${isNested ? 'text-xs' : 'text-sm'}`}>
                                                                {isSite && isNested ? (item.site?.name || item.name?.replace?.(`${parentName} · `, '') || item.name) : item.name}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className={`px-6 ${rowPadding}`}>
                                                    <span className={`inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full ${isLead ? 'bg-blue-100 text-blue-700' : isSite ? 'bg-amber-100 text-amber-700' : isClient ? 'bg-slate-100 text-slate-700' : 'bg-green-100 text-green-700'}`}>
                                                        {isLead ? 'Lead' : isSite ? 'Site' : isClient ? 'Client' : 'Opportunity'}
                                                    </span>
                                                </td>
                                                <td className={`px-6 ${rowPadding}`} onClick={e => e.stopPropagation()}>
                                                    {isClient ? (
                                                        <span className="text-gray-400 text-xs">—</span>
                                                    ) : (
                                                        <select
                                                            value={STAGE_OPTIONS.find(s => s.toLowerCase() === (item.stage || 'awareness').toLowerCase()) || 'Awareness'}
                                                            onChange={e => handlePipelineStageChange(item, e.target.value)}
                                                            className={`min-w-[7rem] px-2 py-1 text-xs font-medium rounded-full border-0 cursor-pointer focus:ring-1 focus:ring-blue-500 ${
                                                                (item.stage || '').toLowerCase() === 'no engagement' ? 'bg-slate-100 text-slate-800' :
                                                                (item.stage || '').toLowerCase() === 'awareness' ? 'bg-gray-100 text-gray-800' :
                                                                (item.stage || '').toLowerCase() === 'interest' ? 'bg-blue-100 text-blue-800' :
                                                                (item.stage || '').toLowerCase() === 'desire' ? 'bg-yellow-100 text-yellow-800' :
                                                                (item.stage || '').toLowerCase() === 'action' ? 'bg-green-100 text-green-800' :
                                                                'bg-gray-100 text-gray-800'
                                                            }`}
                                                        >
                                                            {STAGE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                        </select>
                                                    )}
                                                </td>
                                                <td className={`px-6 ${rowPadding}`} onClick={e => e.stopPropagation()}>
                                                    {isClient ? (
                                                        <span className="text-gray-400 text-xs">—</span>
                                                    ) : (
                                                        <select
                                                            value={STATUS_OPTIONS.find(s => s.toLowerCase() === (item.status || 'potential').toLowerCase()) || 'Potential'}
                                                            onChange={e => handlePipelineStatusChange(item, e.target.value)}
                                                            className={`min-w-[7rem] px-2 py-1 text-xs font-medium rounded-full border-0 cursor-pointer focus:ring-1 focus:ring-blue-500 ${getLifecycleBadgeColor(item.status || 'Potential')}`}
                                                        >
                                                            {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                        </select>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                    {/* Pagination */}
                    {totalRows > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 bg-gray-50 rounded-b-lg">
                            <div className="flex items-center gap-4">
                                <span className="text-sm text-gray-600">
                                    Showing {start + 1}&ndash;{Math.min(start + listPageSize, totalRows)} of {totalRows} deals
                                </span>
                                <label className="flex items-center gap-2 text-sm text-gray-600">
                                    <span>Per page</span>
                                    <select
                                        value={listPageSize}
                                        onChange={(e) => {
                                            setListPageSize(Number(e.target.value));
                                            setListPage(1);
                                        }}
                                        className="px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    >
                                        <option value={25}>25</option>
                                        <option value={50}>50</option>
                                        <option value={100}>100</option>
                                    </select>
                                </label>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => setListPage(1)}
                                    disabled={currentPage <= 1}
                                    className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                    aria-label="First page"
                                >
                                    <i className="fas fa-angle-double-left"></i>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setListPage((p) => Math.max(1, p - 1))}
                                    disabled={currentPage <= 1}
                                    className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                    aria-label="Previous page"
                                >
                                    <i className="fas fa-angle-left"></i>
                                </button>
                                <span className="px-3 py-1.5 text-sm text-gray-600 min-w-[7rem] text-center">
                                    Page {currentPage} of {totalPages}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setListPage((p) => Math.min(totalPages, p + 1))}
                                    disabled={currentPage >= totalPages}
                                    className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                    aria-label="Next page"
                                >
                                    <i className="fas fa-angle-right"></i>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setListPage(totalPages)}
                                    disabled={currentPage >= totalPages}
                                    className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                    aria-label="Last page"
                                >
                                    <i className="fas fa-angle-double-right"></i>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl sm:text-2xl font-semibold text-gray-900">Sales Pipeline</h1>
                    <p className="text-sm text-gray-500 mt-0.5">Track deals through AIDA framework</p>
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
                            <option value="No Engagement">No Engagement</option>
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
