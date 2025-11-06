// Get dependencies from window
const { useState, useEffect } = React;
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

const Pipeline = () => {
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
    const [viewMode, setViewMode] = useState('kanban'); // kanban, list, forecast
    const [selectedDeal, setSelectedDeal] = useState(null);
    const [showDealModal, setShowDealModal] = useState(false);
    const [timeRange, setTimeRange] = useState('current'); // current, monthly, quarterly
    const [refreshKey, setRefreshKey] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [touchDragState, setTouchDragState] = useState(null); // { item, type, startY, currentY, targetStage }
    const [justDragged, setJustDragged] = useState(false); // Track if we just completed a drag to prevent accidental clicks

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

    // Load data from API and localStorage
    useEffect(() => {
        loadData();
    }, [refreshKey]);

    // Preload cached data immediately on mount - CRITICAL for instant display
    useEffect(() => {
        // Show cached data immediately while API loads (same as leads do)
        const savedClients = storage.getClients() || [];
        const savedLeads = storage.getLeads() || [];
        
        if (savedClients.length > 0) {
            // Extract and preserve ALL opportunities from cached clients
            const clientsWithOpportunities = savedClients.map(client => ({
                ...client,
                // Ensure opportunities array exists and is properly formatted
                opportunities: Array.isArray(client.opportunities) ? client.opportunities : []
            }));
            
            const totalCachedOpps = clientsWithOpportunities.reduce((sum, c) => sum + (c.opportunities?.length || 0), 0);
            setClients(clientsWithOpportunities);
            console.log(`⚡ Pipeline: Loaded cached data IMMEDIATELY: ${clientsWithOpportunities.length} clients, ${totalCachedOpps} opportunities`);
            
            // Log opportunity details for debugging
            if (totalCachedOpps > 0) {
                clientsWithOpportunities.forEach(client => {
                    if (client.opportunities?.length > 0) {
                        console.log(`   ⚡ ${client.name}: ${client.opportunities.length} opportunities visible immediately`);
                    }
                });
            }
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
        if (viewMode === 'kanban' && (clients.length > 0 || leads.length > 0) && !isLoading) {
            // Use a combination of requestAnimationFrame and a small delay to ensure:
            // 1. Stylesheets are loaded
            // 2. DOM is fully rendered
            // 3. Layout calculations are complete
            const fixLayout = () => {
                const stageColumns = document.querySelectorAll('[data-pipeline-stage]');
                if (stageColumns.length > 0) {
                    // Force browser to recalculate layout by accessing layout properties
                    // This triggers a reflow without causing visual flicker
                    stageColumns.forEach(column => {
                        void column.offsetHeight;
                    });
                    
                    // Also trigger layout on the kanban container
                    const kanbanContainer = stageColumns[0]?.closest('.flex.gap-3');
                    if (kanbanContainer) {
                        void kanbanContainer.offsetHeight;
                    }
                    
                    console.log('✅ Pipeline: Layout recalculation triggered for tile positioning');
                }
            };

            // Double requestAnimationFrame ensures we're after the browser's layout pass
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    // Add a small delay to ensure stylesheets are fully loaded
                    setTimeout(() => {
                        fixLayout();
                    }, 50);
                });
            });
        }
    }, [clients, leads, isLoading, viewMode]);

    // Add resize observer to fix layout when viewport changes or component becomes visible
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

            return () => {
                resizeObserver.disconnect();
            };
        }
    }, [viewMode, clients, leads]);

    const loadData = async () => {
        // Don't set loading state immediately - show cached data first
        // Keep cached opportunities visible while API loads
        const cachedClients = storage.getClients() || [];
        const cachedOpportunities = cachedClients
            .flatMap(c => (c.opportunities || []).map(opp => ({ ...opp, clientId: c.id })))
            .filter(opp => opp.clientId); // Only keep opportunities with valid clientId
        
        // Show cached data immediately if available (instant display like leads)
        if (cachedClients.length > 0) {
            const clientsWithCachedOpps = cachedClients.map(client => ({
                ...client,
                opportunities: Array.isArray(client.opportunities) ? client.opportunities : []
            }));
            setClients(clientsWithCachedOpps);
            const totalCachedOpps = clientsWithCachedOpps.reduce((sum, c) => sum + (c.opportunities?.length || 0), 0);
            if (totalCachedOpps > 0) {
                console.log(`⚡ Pipeline: Showing ${totalCachedOpps} cached opportunities immediately`);
            }
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
                // PRESERVE cached opportunities for clients - only replace when API has newer data
                const clientsWithOpportunities = apiClients.map(client => {
                    // First, get API opportunities for this client
                    let clientOpportunities = allOpportunities.filter(opp => opp.clientId === client.id);
                    
                    // If API has opportunities, use them (they're fresh)
                    if (clientOpportunities.length > 0) {
                        console.log(`   📊 ${client.name}: ${clientOpportunities.length} opportunities from API`);
                    } else {
                        // If no API opportunities, preserve cached ones (keep them visible immediately)
                        const cachedClient = cachedClients.find(c => c.id === client.id);
                        if (cachedClient?.opportunities?.length > 0) {
                            clientOpportunities = cachedClient.opportunities.map(opp => ({
                                ...opp,
                                clientId: client.id
                            }));
                            console.log(`   💾 ${client.name}: Preserving ${clientOpportunities.length} cached opportunities (API had none)`);
                        }
                    }
                    
                    return {
                        ...client,
                        opportunities: clientOpportunities
                    };
                });
                
                // If API opportunities call failed completely, ensure all cached opportunities are preserved
                if (opportunitiesResponse.status !== 'fulfilled' && cachedOpportunities.length > 0) {
                    console.log(`💾 Pipeline: API opportunities failed, preserving all ${cachedOpportunities.length} cached opportunities`);
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
    };

    // Get all pipeline items (leads + client opportunities)
    const getPipelineItems = () => {
        const leadItems = leads.map(lead => ({
            ...lead,
            type: 'lead',
            itemType: 'New Lead',
            stage: lead.stage || 'Awareness',
            value: lead.value || 0,
            createdDate: lead.createdDate || new Date().toISOString(),
            expectedCloseDate: lead.expectedCloseDate || null
        }));

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
    const handleDragStart = (item, type) => {
        setDraggedItem(item);
        setDraggedType(type);
        setIsDragging(true);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    const handleDrop = async (e, targetStage) => {
        e.preventDefault();
        
        if (!draggedItem || !draggedType || draggedItem.stage === targetStage) {
            setDraggedItem(null);
            setDraggedType(null);
            setIsDragging(false);
            return;
        }

        const token = storage.getToken();
        let updateSuccess = false;

        // Update stage - call API first, then update local state on success
        if (draggedType === 'lead') {
            // Update lead in API if authenticated
            if (token && window.DatabaseAPI) {
                try {
                    await window.DatabaseAPI.updateLead(draggedItem.id, { stage: targetStage });
                    console.log('✅ Pipeline: Lead stage updated in API');
                    updateSuccess = true;
                    
                    // Update local state after successful API call
                    const updatedLeads = leads.map(lead => 
                        lead.id === draggedItem.id ? { ...lead, stage: targetStage } : lead
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
                    lead.id === draggedItem.id ? { ...lead, stage: targetStage } : lead
                );
                setLeads(updatedLeads);
            }
        } else if (draggedType === 'opportunity') {
            console.log('🔄 Pipeline: Updating opportunity stage...', {
                opportunityId: draggedItem.id,
                clientId: draggedItem.clientId,
                oldStage: draggedItem.stage,
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
                        id: draggedItem.id,
                        stage: targetStage
                    });
                    // Update the opportunity's stage in the database
                    const response = await window.api.updateOpportunity(draggedItem.id, { 
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
                        if (client.id === draggedItem.clientId) {
                            const updatedOpportunities = client.opportunities.map(opp =>
                                opp.id === draggedItem.id ? { ...opp, stage: targetStage } : opp
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
                        id: draggedItem.id,
                        stage: targetStage
                    });
                    const response = await window.DatabaseAPI.updateOpportunity(draggedItem.id, { stage: targetStage });
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
                        if (client.id === draggedItem.clientId) {
                            const updatedOpportunities = client.opportunities.map(opp =>
                                opp.id === draggedItem.id ? { ...opp, stage: targetStage } : opp
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
                    if (client.id === draggedItem.clientId) {
                        const updatedOpportunities = client.opportunities.map(opp =>
                            opp.id === draggedItem.id ? { ...opp, stage: targetStage } : opp
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

    const metrics = calculateMetrics();
    const filteredItems = getFilteredItems();

    // Render pipeline card
    const PipelineCard = ({ item }) => {
        const age = getDealAge(item.createdDate);

        return (
            <div 
                draggable
                onDragStart={() => handleDragStart(item, item.type)}
                onDragEnd={handleDragEnd}
                onTouchStart={(e) => handleTouchStart(e, item, item.type)}
                onClick={(e) => {
                    // Prevent click if we just completed a drag or are currently dragging
                    if (justDragged || touchDragState || isDragging) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                    }
                    setSelectedDeal(item);
                    setShowDealModal(true);
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
                    <div className="font-medium text-[10px] text-gray-900 line-clamp-1 flex-1 leading-tight truncate">
                        {item.name}
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
                    <span className="text-gray-500 text-[7px] truncate leading-none flex-1 text-right ml-1">
                        {item.industry || '\u00A0'}
                    </span>
                </div>

                {/* Expected Close Date or Spacer - Fixed height to fill remaining space */}
                <div className="flex items-end" style={{ height: '25px', minHeight: '25px', maxHeight: '25px', marginTop: 'auto' }}>
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
                const stageItems = filteredItems.filter(item => item.stage === stage.name);
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

    // List View
    const ListView = () => (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deal</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stage</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Age</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expected Close</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredItems.length === 0 ? (
                            <tr>
                                <td colSpan="6" className="px-4 py-8 text-center text-sm text-gray-500">
                                    <i className="fas fa-inbox text-3xl text-gray-300 mb-2"></i>
                                    <p>No deals found</p>
                                </td>
                            </tr>
                        ) : (
                            filteredItems.map(item => {
                                const age = getDealAge(item.createdDate);
                                
                                return (
                                    <tr 
                                        key={`${item.type}-${item.id}`}
                                        onClick={() => {
                                            setSelectedDeal(item);
                                            setShowDealModal(true);
                                        }}
                                        className="hover:bg-gray-50 cursor-pointer transition"
                                    >
                                        <td className="px-4 py-3">
                                            <div className="text-sm font-medium text-gray-900">{item.name}</div>
                                            {item.type !== 'lead' && (
                                                <div className="text-xs text-gray-500">
                                                    {item.clientName}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                                                item.type === 'lead' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                                            }`}>
                                                {item.itemType}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-sm text-gray-900">{item.stage}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-sm font-medium text-gray-900">
                                                R {item.value.toLocaleString('en-ZA')}
                                            </span>
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
                                                    : '-'
                                                }
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
    );

    // Forecast View
    const ForecastView = () => {
        const monthlyForecasts = [];
        const today = new Date();
        
        for (let i = 0; i < 3; i++) {
            const forecastMonth = new Date(today.getFullYear(), today.getMonth() + i, 1);
            const monthName = forecastMonth.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
            
            // Filter deals expected to close in this month
            const monthDeals = filteredItems.filter(item => {
                if (!item.expectedCloseDate) return false;
                const closeDate = new Date(item.expectedCloseDate);
                return closeDate.getMonth() === forecastMonth.getMonth() && 
                       closeDate.getFullYear() === forecastMonth.getFullYear();
            });
            
            const monthValue = monthDeals.reduce((sum, item) => sum + item.value, 0);
            
            monthlyForecasts.push({
                month: monthName,
                deals: monthDeals.length,
                value: monthValue,
                items: monthDeals
            });
        }

        return (
            <div className="space-y-6">
                {/* Forecast Summary */}
                <div className="grid grid-cols-3 gap-4">
                    {monthlyForecasts.map((forecast, index) => (
                        <div key={index} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                            <div className="text-sm font-medium text-gray-600 mb-2">{forecast.month}</div>
                            <div className="text-2xl font-bold text-gray-900 mb-1">
                                R {forecast.value.toLocaleString('en-ZA')}
                            </div>
                            <div className="text-xs text-gray-500">
                                {forecast.deals} deals
                            </div>
                        </div>
                    ))}
                </div>

                {/* Monthly Breakdown */}
                {monthlyForecasts.map((forecast, index) => (
                    <div key={index} className="bg-white rounded-lg shadow-sm border border-gray-200">
                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                            <h3 className="text-sm font-semibold text-gray-900">{forecast.month}</h3>
                        </div>
                        <div className="p-4">
                            {forecast.items.length === 0 ? (
                                <p className="text-sm text-gray-500 text-center py-4">No deals forecasted for this month</p>
                            ) : (
                                <div className="space-y-2">
                                    {forecast.items.map(item => (
                                        <div 
                                            key={`${item.type}-${item.id}`}
                                            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition"
                                            onClick={() => {
                                                setSelectedDeal(item);
                                                setShowDealModal(true);
                                            }}
                                        >
                                            <div className="flex-1">
                                                <div className="font-medium text-sm text-gray-900">{item.name}</div>
                                                <div className="text-xs text-gray-500">
                                                    {item.stage} • {item.type === 'lead' ? 'Lead' : 'Opportunity'}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-sm font-medium text-gray-900">
                                                    R {item.value.toLocaleString('en-ZA')}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
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
                            onClick={() => setViewMode('kanban')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                                viewMode === 'kanban' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
                            }`}
                        >
                            <i className="fas fa-th mr-2"></i>
                            Kanban
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                                viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
                            }`}
                        >
                            <i className="fas fa-list mr-2"></i>
                            List
                        </button>
                        <button
                            onClick={() => setViewMode('forecast')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                                viewMode === 'forecast' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
                            }`}
                        >
                            <i className="fas fa-chart-line mr-2"></i>
                            Forecast
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
            {viewMode === 'forecast' && <ForecastView />}
        </div>
    );
};

window.Pipeline = Pipeline;
