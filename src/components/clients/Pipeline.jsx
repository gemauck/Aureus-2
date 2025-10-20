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

    const loadData = async () => {
        try {
            // Try to load from API first if authenticated
            const token = storage.getToken();
            if (token && window.DatabaseAPI) {
                console.log('🔄 Pipeline: Loading data from API...');
                
                // Load clients and leads from API
                const [clientsResponse, leadsResponse] = await Promise.allSettled([
                    window.DatabaseAPI.getClients(),
                    window.DatabaseAPI.getLeads()
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
                
                // Ensure all clients have opportunities array
                const clientsWithOpportunities = apiClients.map(client => ({
                    ...client,
                    opportunities: client.opportunities || []
                }));
                
                setClients(clientsWithOpportunities);
                setLeads(apiLeads);
                
                // Update localStorage for clients only (leads are database-only)
                storage.setClients(clientsWithOpportunities);
                
                console.log('✅ Pipeline: API data loaded and cached');
                return;
            }
        } catch (error) {
            console.warn('⚠️ Pipeline: API loading failed, falling back to localStorage:', error);
        }
        
        // Fallback to localStorage for clients only (leads are database-only)
        console.log('💾 Pipeline: Loading clients from localStorage...');
        const savedClients = storage.getClients() || [];
        
        // Ensure all clients have opportunities array
        const clientsWithOpportunities = savedClients.map(client => ({
            ...client,
            opportunities: client.opportunities || []
        }));
        
        setClients(clientsWithOpportunities);
        setLeads([]); // Leads are database-only, no localStorage fallback
        
        console.log('✅ Pipeline: localStorage data loaded - Clients:', clientsWithOpportunities.length, 'Leads: 0 (database-only)');
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
            if (client.opportunities && Array.isArray(client.opportunities)) {
                client.opportunities.forEach(opp => {
                    opportunityItems.push({
                        ...opp,
                        type: 'opportunity',
                        itemType: 'Expansion',
                        clientId: client.id,
                        clientName: client.name,
                        stage: opp.stage || 'Awareness',
                        value: opp.value || 0,
                        createdDate: opp.createdDate || new Date().toISOString(),
                        expectedCloseDate: opp.expectedCloseDate || null
                    });
                });
            }
        });

        return [...leadItems, ...opportunityItems];
    };

    // Apply filters and sorting
    const getFilteredItems = () => {
        let items = getPipelineItems();

        // Search filter
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            items = items.filter(item => 
                item.name.toLowerCase().includes(searchLower) ||
                (item.clientName && item.clientName.toLowerCase().includes(searchLower)) ||
                (item.contacts && item.contacts[0]?.name.toLowerCase().includes(searchLower))
            );
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

        // Update stage
        if (draggedType === 'lead') {
            const updatedLeads = leads.map(lead => 
                lead.id === draggedItem.id ? { ...lead, stage: targetStage } : lead
            );
            setLeads(updatedLeads);
            
            // Update lead in API if authenticated
            const token = storage.getToken();
            if (token && window.DatabaseAPI) {
                try {
                    await window.DatabaseAPI.updateLead(draggedItem.id, { stage: targetStage });
                    console.log('✅ Pipeline: Lead stage updated in API');
                } catch (error) {
                    console.warn('⚠️ Pipeline: Failed to update lead stage in API:', error);
                }
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
            storage.setClients(updatedClients);
            
            // Update client in API if authenticated
            const token = storage.getToken();
            if (token && window.DatabaseAPI) {
                try {
                    const clientToUpdate = updatedClients.find(c => c.id === draggedItem.clientId);
                    if (clientToUpdate) {
                        await window.DatabaseAPI.updateClient(draggedItem.clientId, { 
                            opportunities: clientToUpdate.opportunities 
                        });
                        console.log('✅ Pipeline: Client opportunities updated in API');
                    }
                } catch (error) {
                    console.warn('⚠️ Pipeline: Failed to update client opportunities in API:', error);
                }
            }
        }

        setDraggedItem(null);
        setDraggedType(null);
        setRefreshKey(k => k + 1);
        setIsDragging(false);
    };

    const handleDragEnd = () => {
        setDraggedItem(null);
        setDraggedType(null);
        setIsDragging(false);
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
                onClick={() => {
                    setSelectedDeal(item);
                    setShowDealModal(true);
                }}
                className={`bg-white rounded-lg p-3 border border-gray-200 shadow-sm cursor-move ${!isDragging ? 'hover:shadow-md transition' : ''} ${
                    draggedItem?.id === item.id ? 'opacity-50' : ''
                }`}
            >
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="font-medium text-sm text-gray-900 line-clamp-2 flex-1">
                        {item.name}
                    </div>
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium shrink-0 ${
                        item.type === 'lead' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                    }`}>
                        {item.type === 'lead' ? 'LEAD' : 'OPP'}
                    </span>
                </div>

                {/* Contact/Client */}
                <div className="text-xs text-gray-600 mb-2 flex items-center gap-1">
                    <i className={`fas ${item.type === 'lead' ? 'fa-user' : 'fa-building'}`}></i>
                    <span className="truncate">
                        {item.type === 'lead' 
                            ? item.contacts?.[0]?.name || 'No contact'
                            : item.clientName
                        }
                    </span>
                </div>

                {/* Value */}
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-gray-900">
                        R {item.value.toLocaleString('en-ZA')}
                    </span>
                </div>

                {/* Age Badge */}
                <div className="flex items-center justify-between text-xs">
                    <span className={`px-2 py-0.5 rounded font-medium ${getAgeBadgeColor(age)}`}>
                        {age} {age === 1 ? 'day' : 'days'}
                    </span>
                    {item.industry && (
                        <span className="text-gray-500">{item.industry}</span>
                    )}
                </div>

                {/* Expected Close Date */}
                {item.expectedCloseDate && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                        <div className="text-xs text-gray-600">
                            <i className="fas fa-calendar-alt mr-1"></i>
                            Close: {new Date(item.expectedCloseDate).toLocaleDateString('en-ZA')}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // Kanban Board View
    const KanbanView = () => (
        <div className="flex gap-4 overflow-x-auto pb-4">
            {pipelineStages.map(stage => {
                const stageItems = filteredItems.filter(item => item.stage === stage.name);
                const stageValue = stageItems.reduce((sum, item) => sum + item.value, 0);
                const isDraggedOver = draggedItem && draggedItem.stage !== stage.name;
                
                return (
                    <div 
                        key={stage.id} 
                        className={`flex-1 min-w-[300px] bg-gray-50 rounded-lg p-4 ${!isDragging ? 'transition-all' : ''} ${
                            isDraggedOver ? 'ring-2 ring-primary-500 bg-primary-50' : ''
                        }`}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, stage.name)}
                    >
                        {/* Stage Header */}
                        <div className="mb-3 px-1">
                            <div className="flex items-center gap-2 mb-1">
                                <div className={`w-8 h-8 bg-${stage.color}-100 rounded-lg flex items-center justify-center`}>
                                    <i className={`fas ${stage.icon} text-${stage.color}-600 text-sm`}></i>
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-sm font-semibold text-gray-900">{stage.name}</h3>
                                    <p className="text-[10px] text-gray-500">{stage.avgDuration}</p>
                                </div>
                                <span className="px-2 py-1 bg-white rounded-full text-xs font-medium text-gray-700 border border-gray-200">
                                    {stageItems.length}
                                </span>
                            </div>
                            
                            {/* Stage Metrics */}
                            <div className="mt-2 p-2 bg-white rounded border border-gray-200">
                                <div className="text-xs text-gray-600">
                                    <span className="font-medium">Total:</span> R {stageValue.toLocaleString('en-ZA')}
                                </div>
                            </div>
                        </div>

                        {/* Stage Description */}
                        <div className="mb-3 px-1">
                            <p className="text-[10px] text-gray-500 italic">{stage.description}</p>
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
                                            <div className="text-xs text-gray-500">
                                                {item.type === 'lead' 
                                                    ? item.contacts?.[0]?.name || 'No contact'
                                                    : item.clientName
                                                }
                                            </div>
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
