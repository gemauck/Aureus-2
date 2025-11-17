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
 * - Kanban board with drag-and-drop across AIDA stages
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
        source: 'All'
    });
    const [sortBy, setSortBy] = useState('value-desc');
    const [viewMode, setViewMode] = useState('list'); // list, kanban
    const [refreshKey, setRefreshKey] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [touchDragState, setTouchDragState] = useState(null); // { item, type, startY, currentY, targetStage }
    const [justDragged, setJustDragged] = useState(false); // Track if we just completed a drag to prevent accidental clicks
    const [draggedOverStage, setDraggedOverStage] = useState(null);
    const [dataLoaded, setDataLoaded] = useState(false); // Track when data is fully loaded from API
    const [fallbackDeal, setFallbackDeal] = useState(null); // { type: 'lead' | 'opportunity', id, data, client }
    const [listSortColumn, setListSortColumn] = useState(null);
    const [listSortDirection, setListSortDirection] = useState('asc');
    

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

    const matchingStage = pipelineStages.find(
        (stage) => stage.name.toLowerCase() === lower || stage.id === lower
    );

    if (matchingStage) {
        return matchingStage.name;
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
            console.log(
                `⚡ Pipeline: Loaded cached clients IMMEDIATELY: ${clientsWithoutOpportunities.length} clients (opportunities will load from API with correct stages)`
            );
        }

        if (normalizedSavedLeads.length > 0) {
            setLeads(normalizedSavedLeads);
            console.log('⚡ Pipeline: Loaded cached leads immediately:', normalizedSavedLeads.length, 'leads');
        }
    }, []);

    // Fix tile positioning on initial load - ensure DOM is fully laid out before rendering
    useEffect(() => {
        // Wait for DOM to be fully ready and styles applied
        // This ensures tiles are positioned correctly on first load
        // Only run when data is loaded and we're in kanban view
        if (viewMode === 'kanban' && (clients.length > 0 || leads.length > 0) && !isLoading && dataLoaded) {
            let retryCount = 0;
            const maxRetries = 5;
            
            const fixLayout = () => {
                const stageColumns = document.querySelectorAll('[data-pipeline-stage]');
                const cards = document.querySelectorAll('[draggable="true"]');
                
                // Check if we have both columns and cards rendered
                if (stageColumns.length > 0 && cards.length > 0) {
                    // Force browser to recalculate layout by accessing layout properties
                    // This triggers a reflow without causing visual flicker
                    stageColumns.forEach(column => {
                        void column.offsetHeight;
                        void column.offsetWidth;
                    });
                    
                    // Also trigger layout on the kanban container
                    const kanbanContainer = stageColumns[0]?.closest('.flex.gap-3');
                    if (kanbanContainer) {
                        void kanbanContainer.offsetHeight;
                        void kanbanContainer.offsetWidth;
                    }
                    
                    // Force layout recalculation on cards themselves
                    cards.forEach(card => {
                        void card.offsetHeight;
                    });
                    
                    console.log('✅ Pipeline: Layout recalculation triggered for tile positioning', {
                        columns: stageColumns.length,
                        cards: cards.length,
                        retry: retryCount
                    });
                    return true; // Success
                } else {
                    console.log('⚠️ Pipeline: Layout fix waiting for DOM elements', {
                        columns: stageColumns.length,
                        cards: cards.length,
                        retry: retryCount
                    });
                    return false; // Not ready yet
                }
            };

            const attemptFix = () => {
                // Double requestAnimationFrame ensures we're after the browser's layout pass
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        // Add a delay to ensure stylesheets are fully loaded and DOM is updated
                        setTimeout(() => {
                            const success = fixLayout();
                            
                            // If not successful and we haven't exceeded retries, try again
                            if (!success && retryCount < maxRetries) {
                                retryCount++;
                                setTimeout(attemptFix, 100 * retryCount); // Exponential backoff
                            }
                        }, 100);
                    });
                });
            };

            // Start the fix attempt
            attemptFix();
        }
    }, [clients, leads, isLoading, viewMode, dataLoaded]);

    // Add resize observer and mutation observer to fix layout when viewport changes or cards are added
    useEffect(() => {
        if (viewMode === 'kanban') {
            const kanbanContainer = document.querySelector('[data-pipeline-stage]')?.closest('.flex.gap-3');
            if (!kanbanContainer) return;

            const resizeObserver = new ResizeObserver(() => {
                // Force layout recalculation when container size changes
                requestAnimationFrame(() => {
                    const stageColumns = document.querySelectorAll('[data-pipeline-stage]');
                    stageColumns.forEach(column => {
                        void column.offsetHeight;
                    });
                });
            });

            resizeObserver.observe(kanbanContainer);

            // MutationObserver to detect when cards are added to the DOM
            const mutationObserver = new MutationObserver((mutations) => {
                let shouldFixLayout = false;
                
                mutations.forEach((mutation) => {
                    // Check if cards were added
                    if (mutation.addedNodes.length > 0) {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType === 1 && (node.hasAttribute('draggable') || node.querySelector('[draggable="true"]'))) {
                                shouldFixLayout = true;
                            }
                        });
                    }
                });
                
                if (shouldFixLayout && dataLoaded) {
                    // Wait a bit for the browser to finish rendering
                    setTimeout(() => {
                        requestAnimationFrame(() => {
                            const stageColumns = document.querySelectorAll('[data-pipeline-stage]');
                            const cards = document.querySelectorAll('[draggable="true"]');
                            
                            if (stageColumns.length > 0 && cards.length > 0) {
                                stageColumns.forEach(column => {
                                    void column.offsetHeight;
                                    void column.offsetWidth;
                                });
                                
                                cards.forEach(card => {
                                    void card.offsetHeight;
                                });
                                
                                console.log('✅ Pipeline: Layout fixed after cards added to DOM');
                            }
                        });
                    }, 50);
                }
            });

            // Observe the kanban container for changes
            mutationObserver.observe(kanbanContainer, {
                childList: true,
                subtree: true
            });

            return () => {
                resizeObserver.disconnect();
                mutationObserver.disconnect();
            };
        }
    }, [viewMode, clients, leads, dataLoaded]);

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
            const clientsWithoutOpps = normalizedCachedClients.map((client) => ({
                ...client,
                opportunities: []
            }));

            setClients(clientsWithoutOpps);
            console.log(
                `⚡ Pipeline: Showing ${clientsWithoutOpps.length} cached clients (opportunities loading from API with correct stages)`
            );
        }

        if (normalizedCachedLeads.length > 0) {
            setLeads(normalizedCachedLeads);
            console.log('⚡ Pipeline: Loaded cached leads immediately:', normalizedCachedLeads.length, 'leads');
        }

        try {
            const token = typeof storage?.getToken === 'function' ? storage.getToken() : null;

            if (token && window.DatabaseAPI) {
                if (normalizedCachedClients.length === 0) {
                    setIsLoading(true);
                } else {
                    console.log('⚡ Pipeline: Using cached data, refreshing from API in background...');
                }

                console.log('🔄 Pipeline: Refreshing data from API...');

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
                    console.log('✅ Pipeline: Loaded clients from API:', apiClients.length);
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
                    console.log('✅ Pipeline: Loaded leads from API:', apiLeads.length);
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

                    console.log(
                        `✅ Pipeline: Loaded ${allOpportunities.length} opportunities from parallel fetch`
                    );
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
                        console.log(
                            `   📊 ${client.name}: ${clientOpportunities.length} opportunities from API (normalized stages)`
                        );
                    } else if (opportunitiesResponse.status === 'fulfilled') {
                        console.log(`   ✅ ${client.name}: No opportunities from API (client has none)`);
                    }

                    return {
                        ...client,
                        opportunities: clientOpportunities
                    };
                });

                let finalClients = clientsWithOpportunities;

                if (opportunitiesResponse.status !== 'fulfilled' && cachedOpportunities.length > 0) {
                    console.log(
                        `⚠️ Pipeline: API opportunities failed, using cached data (stages may be stale)`
                    );

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
                    console.log('✅ Pipeline: API opportunities loaded successfully - using API stages only');
                }

                const totalOpportunities = finalClients.reduce(
                    (sum, c) => sum + (Array.isArray(c.opportunities) ? c.opportunities.length : 0),
                    0
                );

                console.log(
                    `✅ Pipeline: Total opportunities loaded: ${totalOpportunities} across ${finalClients.length} clients`
                );

                setClients(finalClients);
                setLeads(apiLeads);

                if (typeof storage?.setClients === 'function') {
                    storage.setClients(finalClients);
                }

                if (typeof storage?.setLeads === 'function') {
                    storage.setLeads(apiLeads);
                }

                console.log('✅ Pipeline: API data refreshed and cached with opportunities');
                setIsLoading(false);
                setDataLoaded(true);
                return;
            }
        } catch (error) {
            console.warn('⚠️ Pipeline: API loading failed, using cached data:', error);
        }

        if (normalizedCachedClients.length > 0 || normalizedCachedLeads.length > 0) {
            setClients(normalizedCachedClients);
            setLeads(normalizedCachedLeads);
            console.log(
                '✅ Pipeline: Using cached data - Clients:',
                normalizedCachedClients.length,
                'Leads:',
                normalizedCachedLeads.length
            );
        } else {
            setClients([]);
            setLeads([]);
            console.log('📭 Pipeline: No cached data available');
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
                console.log(`🔄 Pipeline: Mapped lead stage "${originalStage}" → "${mappedStage}" for ${lead.name || lead.id}`);
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
                expectedCloseDate: lead.expectedCloseDate || null
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
                        console.log(`🔄 Pipeline: Mapped opportunity stage "${originalStage}" → "${mappedStage}" for ${opp.title || opp.id}`);
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
                        industry: opp.industry || client.industry || 'Other'
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
            console.log(`✅ Pipeline: Processed ${opportunityItems.length} opportunity items for display:`, opportunityItems.map(opp => ({
                name: opp.name,
                stage: opp.stage,
                value: opp.value,
                clientName: opp.clientName
            })));
        } else {
            console.log(`📭 Pipeline: No opportunity items to display. Total clients: ${clients.length}, Clients with opportunities: ${clients.filter(c => c.opportunities?.length > 0).length}`);
        }

        return [...leadItems, ...opportunityItems];
    };

    // Apply filters and sorting
    const getFilteredItems = () => {
        let items = getPipelineItems();

        // Search filter
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            items = items.filter(item => {
                const matchesName = item.name.toLowerCase().includes(searchLower);
                const matchesClientName = item.clientName && item.clientName.toLowerCase().includes(searchLower);
                // Only search contacts for opportunities, not leads
                const matchesContact = item.type !== 'lead' && item.contacts && item.contacts[0]?.name.toLowerCase().includes(searchLower);
                return matchesName || matchesClientName || matchesContact;
            });
        }

        // Value filters
        if (filters.minValue) {
            items = items.filter(item => item.value >= Number(filters.minValue));
        }
        if (filters.maxValue) {
            items = items.filter(item => item.value <= Number(filters.maxValue));
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
                    return (a, b) => directionMultiplier * (a.stage || '').localeCompare(b.stage || '');
                case 'value':
                    return (a, b) =>
                        directionMultiplier *
                        ((Number(a?.value ?? 0) || 0) - (Number(b?.value ?? 0) || 0));
                case 'age':
                    return (a, b) =>
                        directionMultiplier *
                        (getDealAge(a?.createdDate) - getDealAge(b?.createdDate));
                case 'expectedClose':
                    return (a, b) =>
                        directionMultiplier *
                        (
                            (a?.expectedCloseDate ? new Date(a.expectedCloseDate).getTime() : Number.POSITIVE_INFINITY) -
                            (b?.expectedCloseDate ? new Date(b.expectedCloseDate).getTime() : Number.POSITIVE_INFINITY)
                        );
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
            // Match TaskManagement exactly - use single key with item ID
            // Store type in state, not dataTransfer (simpler, more reliable)
            event.dataTransfer.setData('pipelineItemId', String(item.id));
            event.dataTransfer.effectAllowed = 'move';
        }
        setDraggedItem(item);
        setDraggedType(type); // Store type in state for recovery
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
                        console.log(`⭐ Lead ${currentStarred ? 'unstarred' : 'starred'} successfully`);
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
                        console.log(`⭐ Opportunity ${currentStarred ? 'unstarred' : 'starred'} successfully`);
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

    const handleDrop = async (e, targetStage) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Simple data retrieval like TaskManagement - this is the key!
        const itemId = e.dataTransfer.getData('pipelineItemId');
        const itemType = e.dataTransfer.getData('pipelineItemType');
        
        if (!itemId || itemId === '') {
            return;
        }

        // Find the item from current data
        const item = getPipelineItems().find(i => String(i.id) === String(itemId) && i.type === itemType);
        
        if (!item) {
            return;
        }

        const currentStage = item.stage;
        if (currentStage === targetStage) {
            return; // Already in target stage
        }

        try {
            // Optimistic UI update
            if (itemType === 'lead') {
                updateLeadStageOptimistically(item.id, targetStage);
            } else if (itemType === 'opportunity') {
                updateOpportunityStageOptimistically(item.clientId, item.id, targetStage);
            }
            setRefreshKey((k) => k + 1); // Force immediate re-render

            // Persist to database
            if (itemType === 'lead') {
                const updateFn = window.api?.updateLeadStage || window.DatabaseAPI?.updateLeadStage;
                if (updateFn) {
                    await updateFn(item.id, targetStage);
                }
            } else if (itemType === 'opportunity') {
                const updateFn = window.api?.updateOpportunityStage || window.DatabaseAPI?.updateOpportunityStage;
                if (updateFn && item.clientId) {
                    await updateFn(item.clientId, item.id, targetStage);
                }
            }
        } catch (error) {
            console.error('❌ Pipeline: Failed to update stage', error);
            alert('Failed to update stage. Please try again.');
            setRefreshKey((k) => k + 1); // Revert by refreshing
        } finally {
            setDraggedItem(null);
            setDraggedType(null);
            setIsDragging(false);
            setDraggedOverStage(null);
            setTouchDragState(null);
            setJustDragged(true);
            setTimeout(() => {
                setJustDragged(false);
            }, 300);
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
                            console.log('✅ Pipeline: Lead stage updated via touch drag');
                            
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
                            console.log('✅ Pipeline: Opportunity stage updated via touch drag:', targetStage);
                            
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
                            console.log('✅ Pipeline: Opportunity stage updated via touch drag (DatabaseAPI)');
                            
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
                                console.log('✅ Pipeline: Client opportunities updated via touch drag');
                                
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
            setTimeout(() => setRefreshKey(k => k + 1), 0);
        }
    }, [setRefreshKey]);

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

    // Diagnostic function to verify drag and drop setup
    useEffect(() => {
        if (viewMode === 'kanban' && dataLoaded) {
            setTimeout(() => {
                const cards = document.querySelectorAll('[data-pipeline-stage] [draggable="true"]');
                const stages = document.querySelectorAll('[data-pipeline-stage]');
                console.log('🔍 Pipeline: Drag and drop diagnostic', {
                    cardsFound: cards.length,
                    stagesFound: stages.length,
                    cardsWithDraggable: Array.from(cards).filter(c => c.draggable === true).length,
                    stagesWithNativeListeners: Array.from(stages).filter(s => s._pipelineDragover && s._pipelineDrop).length,
                    sampleCard: cards[0] ? {
                        draggable: cards[0].draggable,
                        hasDragStart: cards[0].ondragstart !== null,
                        pointerEvents: window.getComputedStyle(cards[0]).pointerEvents,
                        userSelect: window.getComputedStyle(cards[0]).userSelect
                    } : null
                });
            }, 1000);
        }
    }, [viewMode, dataLoaded, filteredItems.length]);

    // Kanban Board View
    const KanbanView = () => (
        <div className="flex gap-3 overflow-x-auto pb-4">
            {pipelineStages.map(stage => {
                const stageItems = filteredItems
                    .filter(item => item.stage === stage.name)
                    .sort((a, b) => {
                        const aStar = a.isStarred ? 1 : 0;
                        const bStar = b.isStarred ? 1 : 0;
                        if (aStar !== bStar) {
                            return bStar - aStar;
                        }
                        switch (sortBy) {
                            case 'value-desc': return b.value - a.value;
                            case 'value-asc': return a.value - b.value;
                            case 'date-desc': return new Date(b.createdDate) - new Date(a.createdDate);
                            case 'date-asc': return new Date(a.createdDate) - new Date(b.createdDate);
                            case 'name-asc': return a.name.localeCompare(b.name);
                            case 'name-desc': return b.name.localeCompare(a.name);
                            default: return 0;
                        }
                    });
                const stageValue = stageItems.reduce((sum, item) => sum + item.value, 0);
                const isStageHighlighted =
                    draggedOverStage === stage.name ||
                    (touchDragState && touchDragState.targetStage === stage.name);
                
                // Define handlers inline like TaskManagement - this ensures proper closure
                const handleDragOver = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDraggedOverStage(stage.name);
                    if (e.dataTransfer) {
                        e.dataTransfer.dropEffect = 'move';
                    }
                };

                const handleDragLeave = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const relatedTarget = e.relatedTarget;
                    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
                        setDraggedOverStage((prev) => (prev === stage.name ? null : prev));
                    }
                };

                const handleDrop = async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDraggedOverStage(null);
                    
                    // Match TaskManagement exactly - simple getData call
                    const itemId = e.dataTransfer.getData('pipelineItemId');
                    if (!itemId || itemId === '') {
                        return;
                    }

                    // Find item by ID (use draggedType from state if available, otherwise search both types)
                    let item = null;
                    if (draggedType) {
                        item = getPipelineItems().find(i => String(i.id) === String(itemId) && i.type === draggedType);
                    } else {
                        // Fallback: search both leads and opportunities
                        item = getPipelineItems().find(i => String(i.id) === String(itemId));
                    }
                    
                    if (!item || item.stage === stage.name) {
                        return;
                    }

                    // Use draggedType from state, or fallback to item.type
                    const finalType = draggedType || item.type;

                    try {
                        // Optimistic UI update
                        if (finalType === 'lead') {
                            updateLeadStageOptimistically(item.id, stage.name);
                        } else if (finalType === 'opportunity') {
                            updateOpportunityStageOptimistically(item.clientId, item.id, stage.name);
                        }
                        setRefreshKey((k) => k + 1);

                        // Persist to database
                        if (finalType === 'lead') {
                            const updateFn = window.api?.updateLeadStage || window.DatabaseAPI?.updateLeadStage;
                            if (updateFn) {
                                await updateFn(item.id, stage.name);
                            }
                        } else if (finalType === 'opportunity') {
                            const updateFn = window.api?.updateOpportunityStage || window.DatabaseAPI?.updateOpportunityStage;
                            if (updateFn && item.clientId) {
                                await updateFn(item.clientId, item.id, stage.name);
                            }
                        }
                    } catch (error) {
                        console.error('❌ Pipeline: Failed to update stage', error);
                        alert('Failed to update stage. Please try again.');
                        setRefreshKey((k) => k + 1);
                    } finally {
                        setDraggedItem(null);
                        setDraggedType(null);
                        setIsDragging(false);
                        setTouchDragState(null);
                        setJustDragged(true);
                        setTimeout(() => {
                            setJustDragged(false);
                        }, 300);
                    }
                };

                return (
                    <div 
                        key={stage.id} 
                        data-pipeline-stage={stage.name}
                        className={`flex-1 min-w-[240px] bg-gray-50 rounded-lg p-3 ${!isDragging ? 'transition-all' : ''} ${
                            isStageHighlighted ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                        }`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        {/* Stage Header */}
                        <div className="mb-2 px-1">
                            <div className="flex items-center gap-2 mb-1">
                                <div className={`w-6 h-6 bg-${stage.color}-100 rounded-lg flex items-center justify-center`}>
                                    <i className={`fas ${stage.icon} text-${stage.color}-600 text-xs`}></i>
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-xs font-semibold text-gray-900">{stage.name}</h3>
                                    <p className="text-[9px] text-gray-500">{stage.avgDuration}</p>
                                </div>
                                <span className="px-1.5 py-0.5 bg-white rounded-full text-xs font-medium text-gray-700 border border-gray-200">
                                    {stageItems.length}
                                </span>
                            </div>
                            
                            {/* Stage Metrics */}
                            <div className="mt-1.5 p-1.5 bg-white rounded border border-gray-200">
                                <div className="text-[10px] text-gray-600">
                                    <span className="font-medium">Total:</span> R {stageValue.toLocaleString('en-ZA')}
                                </div>
                            </div>
                        </div>

                        {/* Stage Description */}
                        <div className="mb-2 px-1">
                            <p className="text-[9px] text-gray-500 italic">{stage.description}</p>
                        </div>

                        {/* Cards */}
                        <div 
                            className="space-y-3 min-h-[100px]"
                        >
                            {stageItems.length === 0 ? (
                                <div 
                                    className={`text-center py-8 rounded-lg border-2 border-dashed ${!isDragging ? 'transition' : ''} ${
                                        (draggedOverStage === stage.name || (touchDragState && touchDragState.targetStage === stage.name)) ? 'border-primary-400 bg-primary-50' : 'border-gray-300'
                                    }`}
                                >
                                    <i className="fas fa-inbox text-2xl text-gray-300 mb-2"></i>
                                    <p className="text-xs text-gray-400">No deals in this stage</p>
                                    <p className="text-[10px] text-gray-400 mt-1">Drag deals here</p>
                                </div>
                            ) : (
                                stageItems.map(item => (
                                    <PipelineCard key={`${item.type}-${item.id}`} item={item} />
                                ))
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );

    // Combined Deals List View
    const ListView = () => {
        const items = getFilteredItems();

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
                    className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                    aria-sort={getAriaSort(column)}
                    scope="col"
                >
                    <button
                        type="button"
                        onClick={() => handleListSort(column)}
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
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    {renderSortableHeader('Name', 'name')}
                                    {renderSortableHeader('Company', 'company')}
                                    {renderSortableHeader('Type', 'type')}
                                    {renderSortableHeader('Status', 'status')}
                                    {renderSortableHeader('AIDA Stage', 'stage')}
                                    {renderSortableHeader('Value', 'value')}
                                    {renderSortableHeader('Age', 'age')}
                                    {renderSortableHeader('Expected Close', 'expectedClose')}
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {items.length === 0 ? (
                                    <tr>
                                        <td colSpan="8" className="px-4 py-12 text-center text-sm text-gray-500">
                                            <i className="fas fa-list-ul text-3xl text-gray-300 mb-3"></i>
                                            <p>No leads or opportunities match your filters.</p>
                                            <p className="text-xs text-gray-400 mt-1">Adjust filters to see more results.</p>
                                        </td>
                                    </tr>
                                ) : (
                                    items.map(item => {
                                        const age = getDealAge(item.createdDate);
                                        const isLead = item.type === 'lead';

                                        return (
                                            <tr
                                                key={`${item.type}-${item.id}`}
                                                className="hover:bg-gray-50 cursor-pointer transition"
                                                onClick={() => openDealDetail(item)}
                                            >
                                                <td className="px-6 py-4">
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
                                                <td className="px-6 py-4 text-sm text-gray-700">
                                                    {isLead ? (item.company || 'Lead') : (item.clientName || 'Unknown Client')}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full ${isLead ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                                                        {isLead ? 'Lead' : 'Opportunity'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full ${getLifecycleBadgeColor(item.status || 'Potential')}`}>
                                                        {item.status || 'Potential'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-sm font-medium text-gray-900">{item.stage}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-sm font-semibold text-gray-900">{formatCurrency(item.value)}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full ${getAgeBadgeColor(age)}`}>
                                                        {age}d
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-700">
                                                    {item.expectedCloseDate
                                                        ? new Date(item.expectedCloseDate).toLocaleDateString('en-ZA')
                                                        : 'Not set'}
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
                            console.log('🔄 Pipeline: Manual refresh triggered');
                            setRefreshKey(k => k + 1);
                        }}
                        className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition text-sm font-medium"
                    >
                        <i className="fas fa-sync-alt mr-2"></i>
                        Refresh
                    </button>
                </div>
            </div>

            {/* View Toggle & Filters */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-4">
                {/* View Mode Tabs */}
                <div className="flex items-center justify-between">
                    <div className="inline-flex bg-gray-100 rounded-lg p-1">
                        <button
                            onClick={() => setViewMode('list')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                                viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
                            }`}
                        >
                            <i className="fas fa-layer-group mr-2"></i>
                            List
                        </button>
                        <button
                            onClick={() => setViewMode('kanban')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                                viewMode === 'kanban' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
                            }`}
                        >
                            <i className="fas fa-th mr-2"></i>
                            Kanban
                        </button>
                    </div>

                    {/* Sort By */}
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                        <option value="value-desc">Value: High to Low</option>
                        <option value="value-asc">Value: Low to High</option>
                        <option value="date-desc">Newest First</option>
                        <option value="date-asc">Oldest First</option>
                        <option value="name-asc">Name: A to Z</option>
                        <option value="name-desc">Name: Z to A</option>
                    </select>
                </div>

                {/* Filters */}
                <div className="grid grid-cols-5 gap-3">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search deals..."
                            value={filters.search}
                            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                        <i className="fas fa-search absolute left-3 top-3 text-gray-400 text-xs"></i>
                    </div>
                    
                    <input
                        type="number"
                        placeholder="Min Value"
                        value={filters.minValue}
                        onChange={(e) => setFilters({ ...filters, minValue: e.target.value })}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    
                    <input
                        type="number"
                        placeholder="Max Value"
                        value={filters.maxValue}
                        onChange={(e) => setFilters({ ...filters, maxValue: e.target.value })}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    
                    <select
                        value={filters.industry}
                        onChange={(e) => setFilters({ ...filters, industry: e.target.value })}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                        <option value="All">All Industries</option>
                        <option value="Mining">Mining</option>
                        <option value="Forestry">Forestry</option>
                        <option value="Agriculture">Agriculture</option>
                        <option value="Other">Other</option>
                    </select>
                    
                    <select
                        value={filters.status}
                        onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                        <option value="All">All Status</option>
                        {statusOptions.map(status => (
                            <option key={status} value={status}>{status}</option>
                        ))}
                    </select>
                </div>

                {/* Active Filters Count */}
                {(filters.search || filters.minValue || filters.maxValue || 
                  filters.industry !== 'All' || filters.status !== 'All') && (
                    <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                        <span className="text-sm text-gray-600">
                            {filteredItems.length} of {getPipelineItems().length} deals shown
                        </span>
                        <button
                            onClick={() => setFilters({
                                search: '',
                                minValue: '',
                                maxValue: '',
                                industry: 'All',
                                status: 'All',
                                source: 'All'
                            })}
                            className="text-sm text-primary-600 hover:text-primary-700"
                        >
                            Clear all filters
                        </button>
                    </div>
                )}
            </div>

            {/* Main Content */}
            {viewMode === 'kanban' && <KanbanView />}
            {viewMode === 'list' && <ListView />}

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

try {
    window.dispatchEvent(new Event('pipeline:component-ready'));
} catch (error) {
    console.warn('⚠️ Pipeline: Unable to dispatch component-ready event', error);
}
