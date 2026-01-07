// Get dependencies from window
const { useState, useEffect, useMemo, useCallback, useRef } = React;
const SectionCommentWidget = window.SectionCommentWidget;

// Safe useAuth wrapper
const useAuthSafe = () => {
    const useAuthHook = window.useAuth && typeof window.useAuth === 'function' ? window.useAuth : null;
    
    if (useAuthHook) {
        try {
            const authResult = useAuthHook();
            if (authResult && typeof authResult === 'object') {
                return authResult;
            }
        } catch (error) {
            console.warn('⚠️ Helpdesk: useAuth hook threw an error:', error);
        }
    }
    
    return {
        user: null,
        logout: () => {
            console.warn('⚠️ Helpdesk: useAuth not available, cannot logout');
            window.location.hash = '#/login';
        },
        loading: false,
        refreshUser: async () => null
    };
};

// Status color mapping
const getStatusColorClasses = (status) => {
    const statusMap = {
        'open': 'bg-blue-100 text-blue-700 border-blue-200',
        'in-progress': 'bg-yellow-100 text-yellow-700 border-yellow-200',
        'resolved': 'bg-green-100 text-green-700 border-green-200',
        'closed': 'bg-gray-100 text-gray-700 border-gray-200',
        'cancelled': 'bg-red-100 text-red-700 border-red-200'
    };
    return statusMap[status] || 'bg-gray-100 text-gray-700 border-gray-200';
};

// Priority color mapping
const getPriorityColorClasses = (priority) => {
    const priorityMap = {
        'low': 'bg-gray-100 text-gray-600',
        'medium': 'bg-blue-100 text-blue-600',
        'high': 'bg-orange-100 text-orange-600',
        'urgent': 'bg-red-100 text-red-600',
        'critical': 'bg-purple-100 text-purple-600'
    };
    return priorityMap[priority] || 'bg-gray-100 text-gray-600';
};

const Helpdesk = () => {
    const { user, logout } = useAuthSafe();
    const [tickets, setTickets] = useState([]);
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    
    // Filters
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterPriority, setFilterPriority] = useState('all');
    const [filterCategory, setFilterCategory] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState('list'); // list or grid
    
    // Load tickets
    const loadTickets = useCallback(async () => {
        try {
            setIsLoading(true);
            setLoadError(null);
            
            const params = new URLSearchParams();
            if (filterStatus !== 'all') params.append('status', filterStatus);
            if (filterPriority !== 'all') params.append('priority', filterPriority);
            if (filterCategory !== 'all') params.append('category', filterCategory);
            if (searchTerm) params.append('search', searchTerm);
            
            const queryString = params.toString();
            const endpoint = `/helpdesk${queryString ? `?${queryString}` : ''}`;
            
            // Use DatabaseAPI.makeRequest if available, otherwise use fetch
            let response;
            if (window.DatabaseAPI && window.DatabaseAPI.makeRequest) {
                response = await window.DatabaseAPI.makeRequest(endpoint, { method: 'GET' });
            } else {
                const url = `/api${endpoint}`;
                const fetchResponse = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    credentials: 'include'
                });
                
                if (!fetchResponse.ok) {
                    throw new Error(`HTTP error! status: ${fetchResponse.status}`);
                }
                
                response = await fetchResponse.json();
            }
            
            if (response && response.tickets) {
                setTickets(response.tickets);
            } else {
                setTickets([]);
            }
        } catch (error) {
            console.error('Error loading tickets:', error);
            setLoadError(error.message || 'Failed to load tickets');
            setTickets([]);
        } finally {
            setIsLoading(false);
        }
    }, [filterStatus, filterPriority, filterCategory, searchTerm]);

    // Load tickets on mount and when filters change
    useEffect(() => {
        loadTickets();
    }, [loadTickets]);

    // Handle create ticket
    const handleCreateTicket = useCallback(() => {
        setSelectedTicket(null);
        setShowModal(true);
    }, []);

    // Handle view ticket
    const handleViewTicket = useCallback((ticket) => {
        setSelectedTicket(ticket);
        setShowModal(true);
    }, []);

    // Handle save ticket
    const handleSaveTicket = useCallback(async (ticketData) => {
        try {
            let savedTicket;
            if (ticketData.id) {
                // Update existing ticket
                let response;
                if (window.DatabaseAPI && window.DatabaseAPI.makeRequest) {
                    response = await window.DatabaseAPI.makeRequest(`/helpdesk/${ticketData.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify(ticketData),
                        headers: { 'Content-Type': 'application/json' }
                    });
                } else {
                    const fetchResponse = await fetch(`/api/helpdesk/${ticketData.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify(ticketData)
                    });
                    if (!fetchResponse.ok) throw new Error(`HTTP error! status: ${fetchResponse.status}`);
                    response = await fetchResponse.json();
                }
                // Handle response format: API returns { data: { ticket: ... } }
                savedTicket = response?.ticket || response?.data?.ticket;
                
                if (savedTicket) {
                    // Update in local state
                    setTickets(prev => prev.map(t => t.id === savedTicket.id ? savedTicket : t));
                    
                    // Close modal after update
                    setShowModal(false);
                    setSelectedTicket(null);
                    
                    // Reload tickets after a short delay to get fresh data with relations
                    setTimeout(async () => {
                        console.log('🔄 Reloading tickets after update...');
                        await loadTickets();
                    }, 300);
                } else {
                    console.error('❌ No ticket in update response:', response);
                    throw new Error('No ticket data in response');
                }
            } else {
                // Create new ticket
                console.log('➕ Creating new ticket with data:', {
                    title: ticketData.title,
                    type: ticketData.type,
                    status: ticketData.status,
                    priority: ticketData.priority,
                    category: ticketData.category
                });
                
                let response;
                try {
                    if (window.DatabaseAPI && window.DatabaseAPI.makeRequest) {
                        console.log('📡 Using DatabaseAPI.makeRequest to create ticket...');
                        response = await window.DatabaseAPI.makeRequest('/helpdesk', {
                            method: 'POST',
                            body: JSON.stringify(ticketData),
                            headers: { 'Content-Type': 'application/json' }
                        });
                        console.log('✅ DatabaseAPI response:', response);
                    } else {
                        console.log('📡 Using fetch to create ticket...');
                        const fetchResponse = await fetch('/api/helpdesk', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify(ticketData)
                        });
                        console.log('📡 Fetch response status:', fetchResponse.status, fetchResponse.statusText);
                        if (!fetchResponse.ok) {
                            const errorText = await fetchResponse.text();
                            console.error('❌ Fetch error response:', errorText);
                            throw new Error(`HTTP error! status: ${fetchResponse.status}, body: ${errorText}`);
                        }
                        response = await fetchResponse.json();
                        console.log('✅ Fetch response data:', response);
                    }
                } catch (apiError) {
                    console.error('❌ API call failed:', apiError);
                    throw apiError;
                }
                
                // Handle response format: API returns { data: { ticket: ... } }
                console.log('🔍 Parsing response. Full response:', response);
                savedTicket = response?.ticket || response?.data?.ticket;
                console.log('🎫 Extracted ticket:', savedTicket);
                
                if (savedTicket) {
                    console.log('✅ Ticket created successfully. Adding to list...');
                    // Add to local state - use functional update to ensure we have latest state
                    setTickets(prev => {
                        // Check if ticket already exists (avoid duplicates)
                        const exists = prev.some(t => t.id === savedTicket.id);
                        if (exists) {
                            console.log('⚠️ Ticket already in list, updating instead...');
                            return prev.map(t => t.id === savedTicket.id ? savedTicket : t);
                        }
                        const updated = [savedTicket, ...prev];
                        console.log('📋 Updated tickets list. New count:', updated.length);
                        console.log('📋 Ticket IDs in list:', updated.map(t => t.id));
                        return updated;
                    });
                    
                    // Close modal first
                    setShowModal(false);
                    setSelectedTicket(null);
                    
                    // Reload tickets after a short delay to ensure API has indexed the new ticket
                    // This ensures we get the full ticket data with all relations
                    setTimeout(async () => {
                        console.log('🔄 Reloading tickets after creation...');
                        await loadTickets();
                    }, 500);
                } else {
                    console.error('❌ No ticket in create response:', response);
                    console.error('❌ Response structure:', {
                        hasTicket: !!response?.ticket,
                        hasDataTicket: !!response?.data?.ticket,
                        responseKeys: response ? Object.keys(response) : [],
                        fullResponse: response
                    });
                    throw new Error('No ticket data in response');
                }
            }
        } catch (error) {
            console.error('❌ Error saving ticket:', error);
            console.error('❌ Error details:', {
                message: error.message,
                stack: error.stack,
                ticketData: ticketData ? {
                    title: ticketData.title,
                    type: ticketData.type,
                    hasId: !!ticketData.id
                } : null
            });
            alert(`Failed to save ticket: ${error.message}`);
        }
    }, [loadTickets]);

    // Handle delete ticket
    const handleDeleteTicket = useCallback(async (ticketId) => {
        if (!confirm('Are you sure you want to delete this ticket?')) {
            return;
        }

        try {
            if (window.DatabaseAPI && window.DatabaseAPI.makeRequest) {
                await window.DatabaseAPI.makeRequest(`/helpdesk/${ticketId}`, { method: 'DELETE' });
            } else {
                const fetchResponse = await fetch(`/api/helpdesk/${ticketId}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });
                if (!fetchResponse.ok) throw new Error(`HTTP error! status: ${fetchResponse.status}`);
            }
            
            // Remove from local state
            setTickets(prev => prev.filter(t => t.id !== ticketId));
            
            setShowModal(false);
            setSelectedTicket(null);
        } catch (error) {
            console.error('Error deleting ticket:', error);
            alert(`Failed to delete ticket: ${error.message}`);
        }
    }, []);

    // Handle close modal
    const handleCloseModal = useCallback(() => {
        setShowModal(false);
        setSelectedTicket(null);
    }, []);

    // Filtered tickets
    const filteredTickets = useMemo(() => {
        return tickets.filter(ticket => {
            if (filterStatus !== 'all' && ticket.status !== filterStatus) return false;
            if (filterPriority !== 'all' && ticket.priority !== filterPriority) return false;
            if (filterCategory !== 'all' && ticket.category !== filterCategory) return false;
            if (searchTerm) {
                const searchLower = searchTerm.toLowerCase();
                return (
                    ticket.title?.toLowerCase().includes(searchLower) ||
                    ticket.description?.toLowerCase().includes(searchLower) ||
                    ticket.ticketNumber?.toLowerCase().includes(searchLower)
                );
            }
            return true;
        });
    }, [tickets, filterStatus, filterPriority, filterCategory, searchTerm]);

    // Check if TicketDetailModal is available
    const TicketDetailModal = window.TicketDetailModal;

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            {/* Header */}
            <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                                <i className="fas fa-headset mr-2"></i>
                                Helpdesk
                            </h1>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                Manage support tickets and requests
                            </p>
                        </div>
                        <button
                            onClick={handleCreateTicket}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
                        >
                            <i className="fas fa-plus"></i>
                            <span>New Ticket</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex flex-wrap items-center gap-4">
                        {/* Search */}
                        <div className="flex-1 min-w-[200px]">
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Search tickets..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                                <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                            </div>
                        </div>

                        {/* Status Filter */}
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                            <option value="all">All Status</option>
                            <option value="open">Open</option>
                            <option value="in-progress">In Progress</option>
                            <option value="resolved">Resolved</option>
                            <option value="closed">Closed</option>
                            <option value="cancelled">Cancelled</option>
                        </select>

                        {/* Priority Filter */}
                        <select
                            value={filterPriority}
                            onChange={(e) => setFilterPriority(e.target.value)}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                            <option value="all">All Priorities</option>
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="urgent">Urgent</option>
                            <option value="critical">Critical</option>
                        </select>

                        {/* Category Filter */}
                        <select
                            value={filterCategory}
                            onChange={(e) => setFilterCategory(e.target.value)}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                            <option value="all">All Categories</option>
                            <option value="general">General</option>
                            <option value="technical">Technical</option>
                            <option value="billing">Billing</option>
                            <option value="support">Support</option>
                            <option value="feature-request">Feature Request</option>
                            <option value="bug">Bug</option>
                        </select>

                        {/* View Mode Toggle */}
                        <div className="flex items-center space-x-2">
                            <button
                                onClick={() => setViewMode('list')}
                                className={`px-3 py-2 rounded-lg transition-colors ${
                                    viewMode === 'list'
                                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                            >
                                <i className="fas fa-list"></i>
                            </button>
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`px-3 py-2 rounded-lg transition-colors ${
                                    viewMode === 'grid'
                                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                            >
                                <i className="fas fa-th"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {isLoading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                        <p className="text-gray-500 dark:text-gray-400">Loading tickets...</p>
                    </div>
                ) : loadError ? (
                    <div className="text-center py-12">
                        <i className="fas fa-exclamation-triangle text-3xl text-red-500 mb-4"></i>
                        <p className="text-red-600 dark:text-red-400">{loadError}</p>
                        <button
                            onClick={loadTickets}
                            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            Retry
                        </button>
                    </div>
                ) : filteredTickets.length === 0 ? (
                    <div className="text-center py-12">
                        <i className="fas fa-inbox text-4xl text-gray-400 mb-4"></i>
                        <p className="text-gray-500 dark:text-gray-400 text-lg mb-2">No tickets found</p>
                        <p className="text-gray-400 dark:text-gray-500 text-sm mb-4">
                            {searchTerm || filterStatus !== 'all' || filterPriority !== 'all' || filterCategory !== 'all'
                                ? 'Try adjusting your filters'
                                : 'Create your first ticket to get started'}
                        </p>
                        {!searchTerm && filterStatus === 'all' && filterPriority === 'all' && filterCategory === 'all' && (
                            <button
                                onClick={handleCreateTicket}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                            >
                                Create Ticket
                            </button>
                        )}
                    </div>
                ) : viewMode === 'list' ? (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Ticket
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Priority
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Category
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Assigned To
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Created
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {filteredTickets.map((ticket) => (
                                    <tr
                                        key={ticket.id}
                                        onClick={() => handleViewTicket(ticket)}
                                        className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex flex-col">
                                                <div className="text-sm font-medium text-gray-900 dark:text-white">
                                                    {ticket.ticketNumber}
                                                </div>
                                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                                    {ticket.title}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full border ${getStatusColorClasses(ticket.status)}`}>
                                                {ticket.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getPriorityColorClasses(ticket.priority)}`}>
                                                {ticket.priority}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {ticket.category}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {ticket.assignedTo ? (
                                                <div className="flex items-center">
                                                    {ticket.assignedTo.avatar && (
                                                        <img
                                                            src={ticket.assignedTo.avatar}
                                                            alt={ticket.assignedTo.name}
                                                            className="w-6 h-6 rounded-full mr-2"
                                                        />
                                                    )}
                                                    <span>{ticket.assignedTo.name || ticket.assignedTo.email}</span>
                                                </div>
                                            ) : (
                                                <span className="text-gray-400">Unassigned</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {new Date(ticket.createdAt).toLocaleDateString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredTickets.map((ticket) => (
                            <div
                                key={ticket.id}
                                onClick={() => handleViewTicket(ticket)}
                                className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 hover:shadow-lg transition-shadow cursor-pointer"
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                                        {ticket.ticketNumber}
                                    </div>
                                    <span className={`px-2 py-1 text-xs font-semibold rounded-full border ${getStatusColorClasses(ticket.status)}`}>
                                        {ticket.status}
                                    </span>
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                    {ticket.title}
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">
                                    {ticket.description}
                                </p>
                                <div className="flex items-center justify-between">
                                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getPriorityColorClasses(ticket.priority)}`}>
                                        {ticket.priority}
                                    </span>
                                    <span className="text-xs text-gray-400">
                                        {new Date(ticket.createdAt).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Ticket Detail Modal */}
            {showModal && TicketDetailModal && (
                <TicketDetailModal
                    ticket={selectedTicket}
                    onSave={handleSaveTicket}
                    onClose={handleCloseModal}
                    onDelete={selectedTicket ? () => handleDeleteTicket(selectedTicket.id) : null}
                />
            )}
        </div>
    );
};

// Register component
window.Helpdesk = Helpdesk;

// Dispatch event
try {
    window.dispatchEvent(new CustomEvent('componentLoaded', { 
        detail: { component: 'Helpdesk' } 
    }));
    console.log('✅ Helpdesk component registered');
} catch (error) {
    console.warn('⚠️ Failed to dispatch componentLoaded event:', error);
}

