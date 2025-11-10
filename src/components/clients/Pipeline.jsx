// Get dependencies from window
const React = window.React;
const { useState, useEffect, useCallback } = React;
const storage = window.storage;

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
        ageRange: 'All',
        source: 'All'
    });
    const [sortBy, setSortBy] = useState('value-desc');
    const [viewMode, setViewMode] = useState('list'); // list, kanban
    const [refreshKey, setRefreshKey] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [touchDragState, setTouchDragState] = useState(null); // { item, type, startY, currentY, targetStage }
    const [justDragged, setJustDragged] = useState(false); // Track if we just completed a drag to prevent accidental clicks
    const [dataLoaded, setDataLoaded] = useState(false); // Track when data is fully loaded from API
    const [fallbackDeal, setFallbackDeal] = useState(null); // { type: 'lead' | 'opportunity', id, data, client }

    useEffect(() => {
        try {
            sessionStorage.removeItem('returnToPipeline');
        } catch (error) {
            console.warn('⚠️ Pipeline: Unable to clear returnToPipeline flag at mount', error);
        }
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

    const normalizeLifecycleStage = (value) => {
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
        const savedClients = storage.getClients() || [];
        const savedLeads = storage.getLeads() || [];
        
        if (savedClients.length > 0) {
            // Load clients but WITHOUT opportunities - opportunities will come from API with correct stages
            const clientsWithoutOpportunities = savedClients.map(client => ({
                ...client,
                // Clear opportunities - they'll be loaded from API with correct stages
                opportunities: []
            }));
            
            setClients(clientsWithoutOpportunities);
            console.log(`⚡ Pipeline: Loaded cached clients IMMEDIATELY: ${clientsWithoutOpportunities.length} clients (opportunities will load from API with correct stages)`);
        }
        
        if (savedLeads.length > 0) {
            setLeads(savedLeads);
            console.log('⚡ Pipeline: Loaded cached leads immediately:', savedLeads.length, 'leads');
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
        // Don't set loading state immediately - show cached data first
        // Keep cached opportunities visible while API loads
        const cachedClients = storage.getClients() || [];
        const cachedOpportunities = cachedClients
            .flatMap(c => (c.opportunities || []).map(opp => ({ ...opp, clientId: c.id })))
            .filter(opp => opp.clientId); // Only keep opportunities with valid clientId
        
        // Show cached clients immediately (but without opportunities - they may have stale stages)
        // Opportunities will be loaded from API with correct stages
        if (cachedClients.length > 0) {
            const clientsWithoutOpps = cachedClients.map(client => ({
                ...client,
                opportunities: [] // Don't show cached opportunities - wait for API with correct stages
            }));
            setClients(clientsWithoutOpps);
            console.log(`⚡ Pipeline: Showing ${clientsWithoutOpps.length} cached clients (opportunities loading from API with correct stages)`);
        }
        
        try {
            // Try to load from API if authenticated (but don't block on cached data)
            const token = storage.getToken();
            if (token && window.DatabaseAPI) {
                // Only set loading if we have no cached data
                if (cachedClients.length === 0) {
                    setIsLoading(true);
                } else {
                    console.log('⚡ Pipeline: Using cached data, refreshing from API in background...');
                }
                
                console.log('🔄 Pipeline: Refreshing data from API...');
                
                // Load clients, leads, and opportunities in parallel for fastest load
                const [clientsResponse, leadsResponse, opportunitiesResponse] = await Promise.allSettled([
                    window.DatabaseAPI.getClients(),
                    window.DatabaseAPI.getLeads(),
                    window.DatabaseAPI?.getOpportunities?.() || window.api?.getOpportunities?.() || Promise.resolve({ data: { opportunities: [] } })
                ]);
                
                // Process clients
                let apiClients = [];
                if (clientsResponse.status === 'fulfilled' && clientsResponse.value?.data?.clients) {
                    apiClients = clientsResponse.value.data.clients;
                    console.log('✅ Pipeline: Loaded clients from API:', apiClients.length);
                }
                
                // Process leads
                let apiLeads = [];
                if (leadsResponse.status === 'fulfilled' && leadsResponse.value?.data?.leads) {
                    apiLeads = leadsResponse.value.data.leads;
                    console.log('✅ Pipeline: Loaded leads from API:', apiLeads.length);
                }
                
                // Process opportunities (already loaded in parallel above)
                let allOpportunities = [];
                if (opportunitiesResponse.status === 'fulfilled' && opportunitiesResponse.value) {
                    const oppData = opportunitiesResponse.value?.data?.opportunities || 
                                  opportunitiesResponse.value?.opportunities || 
                                  [];
                    
                    // Validate and normalize opportunities
                    allOpportunities = oppData.map(opp => ({
                        ...opp,
                        title: opp.title || 'Untitled Opportunity',
                        stage: opp.stage || 'Awareness',
                        value: opp.value || 0,
                        clientId: opp.clientId || opp.client?.id,
                        createdAt: opp.createdAt || opp.createdDate || new Date().toISOString()
                    }));
                    
                    console.log(`✅ Pipeline: Loaded ${allOpportunities.length} opportunities from parallel fetch`);
                } else {
                    console.warn('⚠️ Pipeline: Failed to load opportunities from API, using cached opportunities');
                    // Use cached opportunities if API fails
                    allOpportunities = cachedOpportunities;
                }
                
                // Attach opportunities to their respective clients
                // ALWAYS prioritize API opportunities - they have the latest stage data
                const clientsWithOpportunities = apiClients.map(client => {
                    // Get API opportunities for this client (these have the correct, up-to-date stages)
                    let clientOpportunities = allOpportunities.filter(opp => opp.clientId === client.id);
                    
                    if (clientOpportunities.length > 0) {
                        console.log(`   📊 ${client.name}: ${clientOpportunities.length} opportunities from API (using API stages)`);
                    } else {
                        // Only use cached opportunities if API explicitly returned empty (not if API call failed)
                        // This ensures we don't show stale stage data
                        if (opportunitiesResponse.status === 'fulfilled') {
                            // API succeeded but returned no opportunities for this client - that's correct
                            console.log(`   ✅ ${client.name}: No opportunities from API (client has none)`);
                        } else {
                            // API call failed - fallback to cached (but log warning)
                            const cachedClient = cachedClients.find(c => c.id === client.id);
                            if (cachedClient?.opportunities?.length > 0) {
                                clientOpportunities = cachedClient.opportunities.map(opp => ({
                                    ...opp,
                                    clientId: client.id
                                }));
                                console.log(`   ⚠️ ${client.name}: Using ${clientOpportunities.length} cached opportunities (API failed - stages may be stale)`);
                            }
                        }
                    }
                    
                    return {
                        ...client,
                        opportunities: clientOpportunities
                    };
                });
                
                // Only preserve cached opportunities if API call completely failed
                // This prevents stale stage data from being shown
                if (opportunitiesResponse.status !== 'fulfilled' && cachedOpportunities.length > 0) {
                    console.log(`⚠️ Pipeline: API opportunities failed, using cached data (stages may be stale)`);
                    cachedOpportunities.forEach(cachedOpp => {
                        const client = clientsWithOpportunities.find(c => c.id === cachedOpp.clientId);
                        if (client) {
                            // Only add if not already present (avoid duplicates)
                            const exists = client.opportunities.find(o => o.id === cachedOpp.id);
                            if (!exists) {
                                client.opportunities.push(cachedOpp);
                            }
                        }
                    });
                } else if (opportunitiesResponse.status === 'fulfilled') {
                    // API succeeded - clear any stale cached opportunities that aren't in API response
                    console.log(`✅ Pipeline: API opportunities loaded successfully - using API stages only`);
                }
                
                const totalOpportunities = clientsWithOpportunities.reduce((sum, c) => sum + (c.opportunities?.length || 0), 0);
                console.log(`✅ Pipeline: Total opportunities loaded: ${totalOpportunities} across ${clientsWithOpportunities.length} clients`);
                
                // Update state with fresh API data (seamlessly replaces cached data)
                setClients(clientsWithOpportunities);
                setLeads(apiLeads);
                
                // Update localStorage for both clients and leads (cache for instant load next time)
                storage.setClients(clientsWithOpportunities);
                if (apiLeads.length > 0 || storage.getLeads()) {
                    // Save leads to cache even if empty array (to avoid showing stale data)
                    storage.setLeads(apiLeads);
                }
                
                console.log('✅ Pipeline: API data refreshed and cached with opportunities');
                setIsLoading(false);
                setDataLoaded(true); // Mark data as fully loaded
                return;
            }
        } catch (error) {
            console.warn('⚠️ Pipeline: API loading failed, using cached data:', error);
        }
        
        // If API failed but we have cached data, keep using it (already set in useEffect)
        // Only update if we have no cached data at all
        const savedClients = storage.getClients() || [];
        const savedLeads = storage.getLeads() || [];
        
        if (savedClients.length > 0 || savedLeads.length > 0) {
            // We already set cached data in useEffect, just refresh from localStorage
            const clientsWithOpportunities = savedClients.map(client => ({
                ...client,
                opportunities: client.opportunities || []
            }));
            setClients(clientsWithOpportunities);
            setLeads(savedLeads);
            console.log('✅ Pipeline: Using cached data - Clients:', clientsWithOpportunities.length, 'Leads:', savedLeads.length);
        } else {
            // No cached data at all - empty state
            setClients([]);
            setLeads([]);
            console.log('📭 Pipeline: No cached data available');
        }
        
        setIsLoading(false);
        setDataLoaded(true); // Mark data as loaded even if from cache
    };

    // Get all pipeline items (leads + client opportunities)
    const getPipelineItems = () => {
        const leadItems = leads.map(lead => {
            // Map lead stages to AIDA pipeline stages (same normalization as opportunities)
            let mappedStage = lead.stage || 'Awareness';
            const originalStage = mappedStage;
            
            // Normalize stage value - trim whitespace and handle variations
            if (mappedStage) {
                mappedStage = mappedStage.trim();
            }
            
            // Convert common stage values to AIDA stages
            if (mappedStage === 'prospect' || mappedStage === 'new') {
                mappedStage = 'Awareness';
            } else if (!['Awareness', 'Interest', 'Desire', 'Action'].includes(mappedStage)) {
                // If stage doesn't match AIDA stages, default to Awareness
                mappedStage = 'Awareness';
            }
            
            if (originalStage !== mappedStage) {
                console.log(`🔄 Pipeline: Mapped lead stage "${originalStage}" → "${mappedStage}" for ${lead.name || lead.id}`);
            }
            
            return {
                ...lead,
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
                    // Skip if opportunity is missing required fields
                    if (!opp || !opp.id) {
                        console.warn(`⚠️ Pipeline: Skipping invalid opportunity for ${client.name}:`, opp);
                        return;
                    }
                    
                    // Map opportunity stages to AIDA pipeline stages
                    let mappedStage = opp.stage || 'Awareness';
                    const originalStage = mappedStage;
                    // Convert common stage values to AIDA stages
                    if (mappedStage === 'prospect' || mappedStage === 'new') {
                        mappedStage = 'Awareness';
                    } else if (!['Awareness', 'Interest', 'Desire', 'Action'].includes(mappedStage)) {
                        // If stage doesn't match AIDA stages, default to Awareness
                        mappedStage = 'Awareness';
                    }
                    
                    if (originalStage !== mappedStage) {
                        console.log(`🔄 Pipeline: Mapped opportunity stage "${originalStage}" → "${mappedStage}" for ${opp.title || opp.id}`);
                    }
                    
                    opportunityItems.push({
                        ...opp,
                        id: opp.id,
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

        // Age range filter
        if (filters.ageRange !== 'All') {
            const now = new Date();
            items = items.filter(item => {
                const createdDate = new Date(item.createdDate);
                const daysDiff = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));
                
                switch (filters.ageRange) {
                    case 'new': return daysDiff <= 7;
                    case 'active': return daysDiff > 7 && daysDiff <= 30;
                    case 'aging': return daysDiff > 30 && daysDiff <= 60;
                    case 'stale': return daysDiff > 60;
                    default: return true;
                }
            });
        }

        // Sorting
        items.sort((a, b) => {
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

        return items;
    };

    // Calculate pipeline metrics
    const calculateMetrics = () => {
        const items = getFilteredItems();
        
        const totalValue = items.reduce((sum, item) => sum + item.value, 0);
        const avgDealSize = items.length > 0 ? totalValue / items.length : 0;
        
        const stageBreakdown = pipelineStages.map(stage => {
            const stageItems = items.filter(item => item.stage === stage.name);
            const stageValue = stageItems.reduce((sum, item) => sum + item.value, 0);
            
            return {
                stage: stage.name,
                count: stageItems.length,
                value: stageValue
            };
        });

        // Win rate calculation (mock data - would come from historical data)
        const closedWon = 0; // Would count closed/won deals
        const closedLost = 0; // Would count closed/lost deals
        const winRate = closedWon + closedLost > 0 ? (closedWon / (closedWon + closedLost)) * 100 : 0;

        return {
            totalDeals: items.length,
            totalValue,
            avgDealSize,
            stageBreakdown,
            winRate,
            conversionRate: 0, // Would calculate from historical data
            avgSalesCycle: 49 // Mock data - would calculate from actual deal durations
        };
    };

    // Drag and drop handlers
    const handleDragStart = (event, item, type) => {
        if (event?.dataTransfer) {
            try {
                event.dataTransfer.setData('application/json', JSON.stringify({ id: item.id, type }));
                event.dataTransfer.effectAllowed = 'move';
            } catch (error) {
                console.warn('⚠️ Pipeline: Unable to serialise drag payload', error);
            }
        }
        
        setDraggedItem(item);
        setDraggedType(type);
        setIsDragging(true);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        if (e?.dataTransfer) {
            e.dataTransfer.dropEffect = draggedItem ? 'move' : 'none';
        }
    };

    const handleToggleStar = async (event, item) => {
        event.preventDefault();
        event.stopPropagation();

        try {
            if (item.type === 'lead') {
                const toggleFn = window.api?.toggleStarClient || window.DatabaseAPI?.toggleStarClient;
                if (toggleFn && item.id) {
                    await toggleFn(item.id);
                }

                const updatedLeads = leads.map(lead =>
                    lead.id === item.id ? { ...lead, isStarred: !lead.isStarred } : lead
                );
                setLeads(updatedLeads);
                storage.setLeads(updatedLeads);
            } else if (item.type === 'opportunity') {
                const toggleOpportunityFn = window.api?.toggleStarOpportunity || window.DatabaseAPI?.toggleStarOpportunity;
                if (toggleOpportunityFn && item.id) {
                    await toggleOpportunityFn(item.id);
                }

                const updatedClients = clients.map(client => {
                    if (client.id !== item.clientId) return client;
                    const updatedOpportunities = (client.opportunities || []).map(opp =>
                        opp.id === item.id ? { ...opp, isStarred: !opp.isStarred } : opp
                    );
                    return { ...client, opportunities: updatedOpportunities };
                });

                setClients(updatedClients);
                storage.setClients(updatedClients);
            }

            // Re-sort locally and refresh from API to stay in sync
            setTimeout(() => {
                setRefreshKey(k => k + 1);
            }, 400);
        } catch (error) {
            console.error('❌ Pipeline: Failed to toggle star', error);
            alert('Failed to update favorite. Please try again.');
        }
    };

    const handleDrop = async (e, targetStage) => {
        e.preventDefault();
        
        if (e?.dataTransfer) {
            e.dataTransfer.dropEffect = 'move';
        }
        
        let currentDraggedItem = draggedItem;
        let currentDraggedType = draggedType;

        if ((!currentDraggedItem || !currentDraggedType) && e?.dataTransfer) {
            const rawPayload = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
            if (rawPayload) {
                try {
                    const parsed = JSON.parse(rawPayload);
                    const fallbackItem = getPipelineItems().find(item => item.id === parsed.id && (!parsed.type || item.type === parsed.type));
                    if (fallbackItem) {
                        currentDraggedItem = fallbackItem;
                        currentDraggedType = fallbackItem.type;
                    }
                } catch (error) {
                    console.warn('⚠️ Pipeline: Failed to parse drag payload', error);
                }
            }
        }

        if (!currentDraggedItem || !currentDraggedType || currentDraggedItem.stage === targetStage) {
            setDraggedItem(null);
            setDraggedType(null);
            setIsDragging(false);
            return;
        }

        const token = storage.getToken();
        let updateSuccess = false;

        // Update stage - call API first, then update local state on success
        if (currentDraggedType === 'lead') {
            // Update lead in API if authenticated
            if (token && window.DatabaseAPI) {
                try {
                    await window.DatabaseAPI.updateLead(currentDraggedItem.id, { stage: targetStage });
                    console.log('✅ Pipeline: Lead stage updated in API');
                    updateSuccess = true;
                    
                    // Update local state after successful API call
                    const updatedLeads = leads.map(lead => 
                        lead.id === currentDraggedItem.id ? { ...lead, stage: targetStage } : lead
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
                    lead.id === currentDraggedItem.id ? { ...lead, stage: targetStage } : lead
                );
                setLeads(updatedLeads);
            }
        } else if (currentDraggedType === 'opportunity') {
            console.log('🔄 Pipeline: Updating opportunity stage...', {
                opportunityId: currentDraggedItem.id,
                clientId: currentDraggedItem.clientId,
                oldStage: currentDraggedItem.stage,
                newStage: targetStage,
                hasToken: !!token,
                hasApi: !!window.api,
                hasUpdateOpportunity: !!(window.api?.updateOpportunity),
                hasDatabaseAPI: !!window.DatabaseAPI,
                hasDatabaseUpdateOpportunity: !!(window.DatabaseAPI?.updateOpportunity)
            });
            
            // Update opportunity directly in API if authenticated
            if (token && window.api?.updateOpportunity) {
                try {
                    console.log('📡 Pipeline: Calling window.api.updateOpportunity...', {
                        id: currentDraggedItem.id,
                        stage: targetStage
                    });
                    // Update the opportunity's stage in the database
                    const response = await window.api.updateOpportunity(currentDraggedItem.id, { 
                        stage: targetStage 
                    });
                    console.log('✅ Pipeline: API response received:', JSON.stringify(response, null, 2));
                    
                    // If we get here without an error being thrown, the API call succeeded
                    // The request() function throws on error, so no error = success
                    console.log('✅ Pipeline: Opportunity stage updated in API (no error thrown):', targetStage);
                    console.log('✅ Pipeline: Full API response:', JSON.stringify(response, null, 2));
                    
                    // Verify the response contains the updated opportunity
                    const updatedOpp = response?.data?.data?.opportunity || response?.data?.opportunity;
                    if (updatedOpp) {
                        console.log('✅ Pipeline: Confirmed updated opportunity:', {
                            id: updatedOpp.id,
                            stage: updatedOpp.stage,
                            title: updatedOpp.title
                        });
                        
                        if (updatedOpp.stage !== targetStage) {
                            console.error('❌ Pipeline: CRITICAL - API returned different stage!', {
                                expected: targetStage,
                                actual: updatedOpp.stage
                            });
                            alert(`Warning: Stage mismatch. Expected ${targetStage}, got ${updatedOpp.stage}. Please refresh and try again.`);
                        }
                    } else {
                        console.warn('⚠️ Pipeline: API response did not contain updated opportunity data');
                    }
                    
                    // Update local state optimistically
                    const updatedClients = clients.map(client => {
                        if (client.id === currentDraggedItem.clientId) {
                            const updatedOpportunities = client.opportunities.map(opp =>
                                opp.id === currentDraggedItem.id ? { ...opp, stage: targetStage } : opp
                            );
                            return { ...client, opportunities: updatedOpportunities };
                        }
                        return client;
                    });
                    setClients(updatedClients);
                    
                    // Wait a bit for database to commit, then refresh from API
                    console.log('🔄 Pipeline: Waiting 1.5s for DB commit, then refreshing from API...');
                    setTimeout(() => {
                        console.log('🔄 Pipeline: Forcing API refresh to verify update persisted...');
                        // Clear cache first to force fresh load
                        storage.setClients([]);
                        setRefreshKey(k => k + 1);
                    }, 1500);
                } catch (error) {
                    console.error('❌ Pipeline: Failed to update opportunity stage in API:', error);
                    console.error('❌ Pipeline: Error details:', {
                        message: error.message,
                        stack: error.stack,
                        response: error.response,
                        fullError: error
                    });
                    alert(`Failed to save opportunity stage change: ${error.message || 'Unknown error'}. Please try again.`);
                    // Don't update local state on error - revert to original
                }
            } else if (token && window.DatabaseAPI?.updateOpportunity) {
                try {
                    console.log('📡 Pipeline: Calling window.DatabaseAPI.updateOpportunity...', {
                        id: currentDraggedItem.id,
                        stage: targetStage
                    });
                    const response = await window.DatabaseAPI.updateOpportunity(currentDraggedItem.id, { stage: targetStage });
                    console.log('✅ Pipeline: DatabaseAPI response received:', JSON.stringify(response, null, 2));
                    
                    // If we get here without an error being thrown, the API call succeeded
                    // DatabaseAPI throws on error, so no error = success
                    console.log('✅ Pipeline: Opportunity stage updated via DatabaseAPI (no error thrown):', targetStage);
                    console.log('✅ Pipeline: Full DatabaseAPI response:', JSON.stringify(response, null, 2));
                    
                    // Verify the response contains the updated opportunity
                    const updatedOpp = response?.data?.opportunity;
                    if (updatedOpp) {
                        console.log('✅ Pipeline: Confirmed updated opportunity:', {
                            id: updatedOpp.id,
                            stage: updatedOpp.stage,
                            title: updatedOpp.title
                        });
                        
                        if (updatedOpp.stage !== targetStage) {
                            console.error('❌ Pipeline: CRITICAL - API returned different stage!', {
                                expected: targetStage,
                                actual: updatedOpp.stage
                            });
                            alert(`Warning: Stage mismatch. Expected ${targetStage}, got ${updatedOpp.stage}. Please refresh and try again.`);
                        }
                    } else {
                        console.warn('⚠️ Pipeline: DatabaseAPI response did not contain updated opportunity data');
                    }
                    
                    // Update local state optimistically
                    const updatedClients = clients.map(client => {
                        if (client.id === currentDraggedItem.clientId) {
                            const updatedOpportunities = client.opportunities.map(opp =>
                                opp.id === currentDraggedItem.id ? { ...opp, stage: targetStage } : opp
                            );
                            return { ...client, opportunities: updatedOpportunities };
                        }
                        return client;
                    });
                    setClients(updatedClients);
                    
                    // Wait a bit for database to commit, then refresh from API
                    console.log('🔄 Pipeline: Waiting 1.5s for DB commit, then refreshing from API...');
                    setTimeout(() => {
                        console.log('🔄 Pipeline: Forcing API refresh to verify update persisted...');
                        // Clear cache first to force fresh load
                        storage.setClients([]);
                        setRefreshKey(k => k + 1);
                    }, 1500);
                } catch (error) {
                    console.error('❌ Pipeline: Failed to update opportunity via DatabaseAPI:', error);
                    console.error('❌ Pipeline: Error details:', {
                        message: error.message,
                        stack: error.stack,
                        response: error.response,
                        fullError: error
                    });
                    alert(`Failed to save opportunity stage change: ${error.message || 'Unknown error'}. Please try again.`);
                }
            } else if (token && window.DatabaseAPI) {
                // Fallback to old method if new API not available
                try {
                    const updatedClients = clients.map(client => {
                        if (client.id === draggedItem.clientId) {
                            const updatedOpportunities = client.opportunities.map(opp =>
                                opp.id === draggedItem.id ? { ...opp, stage: targetStage } : opp
                            );
                            return { ...client, opportunities: updatedOpportunities };
                        }
                        return client;
                    });
                    
                    const clientToUpdate = updatedClients.find(c => c.id === draggedItem.clientId);
                    if (clientToUpdate) {
                        await window.DatabaseAPI.updateClient(draggedItem.clientId, { 
                            opportunities: clientToUpdate.opportunities 
                        });
                        console.log('✅ Pipeline: Client opportunities updated via fallback');
                        updateSuccess = true;
                        
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
                    if (client.id === currentDraggedItem.clientId) {
                        const updatedOpportunities = client.opportunities.map(opp =>
                            opp.id === currentDraggedItem.id ? { ...opp, stage: targetStage } : opp
                        );
                        return { ...client, opportunities: updatedOpportunities };
                    }
                    return client;
                });
                setClients(updatedClients);
            }
        }

        setDraggedItem(null);
        setDraggedType(null);
        setIsDragging(false);
    };

    const handleDragEnd = () => {
        setDraggedItem(null);
        setDraggedType(null);
        setIsDragging(false);
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
            if (typeof onOpenLead === 'function') {
                onOpenLead({ leadId: item.id, leadData: item });
                return;
            }
            window.dispatchEvent(new CustomEvent('openLeadDetailFromPipeline', {
                detail: { leadId: item.id }
            }));
        } else {
            if (typeof onOpenOpportunity === 'function') {
                onOpenOpportunity({
                    opportunityId: item.id,
                    clientId: item.clientId || item.client?.id,
                    clientName: item.clientName || item.client?.name || item.name,
                    opportunity: item
                });
                return;
            }
            window.dispatchEvent(new CustomEvent('openOpportunityDetailFromPipeline', {
                detail: {
                    opportunityId: item.id,
                    clientId: item.clientId,
                    clientName: item.clientName || item.client?.name || item.name
                }
            }));
        }
    };

    const metrics = calculateMetrics();
    const filteredItems = getFilteredItems();

    // Render pipeline card
    const PipelineCard = ({ item }) => {
        const age = getDealAge(item.createdDate);

        return (
            <div 
                draggable
                onDragStart={(e) => handleDragStart(e, item, item.type)}
                onDragEnd={handleDragEnd}
                onTouchStart={(e) => handleTouchStart(e, item, item.type)}
                onClick={(e) => {
                    // Prevent click if we just completed a drag or are currently dragging
                    if (justDragged || touchDragState || isDragging) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                    }
                    openDealDetail(item);
                }}
                className={`bg-white rounded-md border border-gray-200 shadow-sm cursor-move flex flex-col overflow-hidden touch-none ${!isDragging ? 'hover:shadow-md transition' : ''} ${
                    draggedItem?.id === item.id ? 'opacity-50' : ''
                }`}
                style={{
                    height: '75px',
                    minHeight: '75px',
                    maxHeight: '75px',
                    padding: '4px',
                    boxSizing: 'border-box',
                    WebkitTouchCallout: 'none',
                    WebkitUserSelect: 'none',
                    userSelect: 'none'
                }}
            >
                {/* Header with Badge - Fixed height */}
                <div className="flex items-center justify-between gap-0.5 mb-0.5" style={{ height: '16px', minHeight: '16px', maxHeight: '16px' }}>
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                        <button
                            type="button"
                            aria-label={item.isStarred ? 'Unstar deal' : 'Star deal'}
                            className="shrink-0 p-0.5 rounded hover:bg-yellow-50 transition"
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
                            <i className={`${item.isStarred ? 'fas text-yellow-500' : 'far text-gray-300'} fa-star text-[10px]`}></i>
                        </button>
                        <div className="font-medium text-[10px] text-gray-900 line-clamp-1 leading-tight truncate">
                            {item.name}
                        </div>
                    </div>
                    <span className={`px-1 py-0.5 text-[8px] rounded font-medium shrink-0 leading-none whitespace-nowrap ${
                        item.type === 'lead' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                    }`}>
                        {item.type === 'lead' ? 'LEAD' : 'OPP'}
                    </span>
                </div>

                {/* Value - Fixed height */}
                <div className="flex items-center mb-0.5" style={{ height: '14px', minHeight: '14px', maxHeight: '14px' }}>
                    <span className="text-[10px] font-bold text-gray-900 leading-tight">
                        R {item.value.toLocaleString('en-ZA')}
                    </span>
                </div>

                {/* Age Badge and Industry - Fixed height */}
                <div className="flex items-center justify-between mb-0.5" style={{ height: '12px', minHeight: '12px', maxHeight: '12px' }}>
                    <span className={`px-0.5 py-0.5 rounded font-medium leading-none ${getAgeBadgeColor(age)}`}>
                        {age}d
                    </span>
                    {item.status ? (
                        <span className={`px-1 py-0.5 text-[8px] rounded font-medium leading-none ml-auto ${getLifecycleBadgeColor(item.status)}`}>
                            {item.status}
                        </span>
                    ) : (
                        <span className="text-gray-400 text-[7px] leading-none ml-auto"> </span>
                    )}
                </div>

                {/* Industry */}
                <div className="text-gray-500 text-[7px] truncate leading-none mb-0.5">
                    {item.industry || '\u00A0'}
                </div>

                {/* Expected Close Date or Spacer - Fixed height to fill remaining space */}
                <div className="flex items-end" style={{ height: '23px', minHeight: '23px', maxHeight: '23px', marginTop: 'auto' }}>
                    {item.expectedCloseDate ? (
                        <div className="text-[8px] text-gray-600 leading-none">
                            <i className="fas fa-calendar-alt mr-0.5 text-[7px]"></i>
                            {new Date(item.expectedCloseDate).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' })}
                        </div>
                    ) : <div></div>}
                </div>
            </div>
        );
    };

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
                const isDraggedOver = draggedItem && draggedItem.stage !== stage.name;
                
                return (
                    <div 
                        key={stage.id} 
                        data-pipeline-stage={stage.name}
                        className={`flex-1 min-w-[240px] bg-gray-50 rounded-lg p-3 ${!isDragging ? 'transition-all' : ''} ${
                            isDraggedOver || (touchDragState && touchDragState.targetStage === stage.name) ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                        }`}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, stage.name)}
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
                        <div className="space-y-2">
                            {stageItems.length === 0 ? (
                                <div className={`text-center py-8 rounded-lg border-2 border-dashed ${!isDragging ? 'transition' : ''} ${
                                    isDraggedOver ? 'border-primary-400 bg-primary-50' : 'border-gray-300'
                                }`}>
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
        const leadCount = items.filter(item => item.type === 'lead').length;
        const opportunityCount = items.filter(item => item.type !== 'lead').length;
        const totalValue = items.reduce((sum, item) => sum + (Number(item.value) || 0), 0);

        return (
            <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                        <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">Total Items</div>
                        <div className="text-2xl font-semibold text-gray-900">{items.length}</div>
                        <div className="text-xs text-gray-500 mt-1">
                            {leadCount} leads • {opportunityCount} opportunities
                        </div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                        <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">Pipeline Value</div>
                        <div className="text-2xl font-semibold text-gray-900">{formatCurrency(totalValue)}</div>
                        <div className="text-xs text-gray-500 mt-1">All leads & opportunities</div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                        <div className="text-xs text-gray-600 uppercase tracking-wide mb-1">Latest Updates</div>
                        <div className="text-sm text-gray-800 font-medium">
                            {items[0] ? `${items[0].status || 'Potential'} • ${items[0].stage || 'Unknown Stage'}` : 'No activity'}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                            Sorted by {sortBy.includes('date') ? 'created date' : 'current sort'}
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stage</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">AIDA Stage</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Age</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expected Close</th>
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
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            aria-label={item.isStarred ? 'Unstar deal' : 'Star deal'}
                                                            className="shrink-0 p-1 rounded-full hover:bg-yellow-50 transition"
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
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                                                                <span className="truncate">{item.name}</span>
                                                                {isLead ? (
                                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">Lead</span>
                                                                ) : (
                                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-700">Opportunity</span>
                                                                )}
                                                            </div>
                                                            <div className="text-xs text-gray-500 mt-1">
                                                                Created {new Date(item.createdDate).toLocaleDateString('en-ZA')}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="text-sm text-gray-900">
                                                        {isLead ? (item.company || 'Lead') : (item.clientName || 'Unknown Client')}
                                                    </div>
                                                    {item.industry && (
                                                        <div className="text-xs text-gray-500 mt-0.5">{item.industry}</div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="text-xs text-gray-600 uppercase font-medium tracking-wide">
                                                        {isLead ? 'New Lead' : 'Expansion'}
                                                    </div>
                                                    {item.source && (
                                                        <div className="text-[10px] text-gray-400 mt-0.5">Source: {item.source}</div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded ${getLifecycleBadgeColor(item.status || 'Potential')}`}>
                                                    {item.status || 'Potential'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-sm font-medium text-gray-900">{item.stage}</span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="text-sm font-semibold text-gray-900">{formatCurrency(item.value)}</span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-1 text-xs rounded font-medium ${getAgeBadgeColor(age)}`}>
                                                        {age}d
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="text-xs text-gray-600">
                                                        {item.expectedCloseDate
                                                            ? new Date(item.expectedCloseDate).toLocaleDateString('en-ZA')
                                                            : 'Not set'}
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
                            console.log('🔄 Pipeline: Manual refresh triggered');
                            setRefreshKey(k => k + 1);
                        }}
                        className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition text-sm font-medium"
                    >
                        <i className="fas fa-sync-alt mr-2"></i>
                        Refresh
                    </button>
                    <button
                        onClick={() => {
                            // Navigate to CRM to add new lead
                            window.dispatchEvent(new CustomEvent('navigateToPage', { detail: { page: 'crm' } }));
                        }}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-sm font-medium"
                    >
                        <i className="fas fa-plus mr-2"></i>
                        New Deal
                    </button>
                </div>
            </div>

            {/* Metrics Dashboard */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <div className="text-xs text-gray-600 mb-1">Pipeline Value</div>
                    <div className="text-2xl font-bold text-gray-900">R {metrics.totalValue.toLocaleString('en-ZA')}</div>
                    <div className="text-xs text-gray-500 mt-1">{metrics.totalDeals} total deals</div>
                </div>
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <div className="text-xs text-gray-600 mb-1">Avg Deal Size</div>
                    <div className="text-2xl font-bold text-purple-600">R {Math.round(metrics.avgDealSize).toLocaleString('en-ZA')}</div>
                    <div className="text-xs text-gray-500 mt-1">{metrics.avgSalesCycle}d avg cycle</div>
                </div>
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                    <div className="text-xs text-gray-600 mb-1">Conversion Rate</div>
                    <div className="text-2xl font-bold text-blue-600">{metrics.conversionRate}%</div>
                    <div className="text-xs text-gray-500 mt-1">Historical average</div>
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
                        value={filters.ageRange}
                        onChange={(e) => setFilters({ ...filters, ageRange: e.target.value })}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                        <option value="All">All Ages</option>
                        <option value="new">New (≤7d)</option>
                        <option value="active">Active (8-30d)</option>
                        <option value="aging">Aging (31-60d)</option>
                        <option value="stale">Stale (&gt;60d)</option>
                    </select>
                </div>

                {/* Active Filters Count */}
                {(filters.search || filters.minValue || filters.maxValue || 
                  filters.industry !== 'All' || filters.ageRange !== 'All') && (
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
                                ageRange: 'All',
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
        </div>
    );
};

window.Pipeline = Pipeline;
