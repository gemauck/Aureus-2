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

const isTicketOverdue = (ticket) => {
    if (!ticket?.dueDate) return false;
    const closed = ['resolved', 'closed', 'cancelled'].includes(ticket.status);
    return !closed && new Date(ticket.dueDate) < new Date();
};

const KANBAN_STATUS_COLUMNS = [
    { value: 'open', label: 'Open' },
    { value: 'in-progress', label: 'In Progress' },
    { value: 'resolved', label: 'Resolved' },
    { value: 'closed', label: 'Closed' },
    { value: 'cancelled', label: 'Cancelled' }
];

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
    const [filterSubmittedByMe, setFilterSubmittedByMe] = useState(false);
    const [filterAssignedToMe, setFilterAssignedToMe] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState('list'); // list, grid, or kanban
    const [listDensity, setListDensity] = useState('comfortable'); // 'comfortable' | 'compact'
    const [focusedIndex, setFocusedIndex] = useState(-1); // keyboard focus in list, -1 = none
    const [toastMessage, setToastMessage] = useState(null); // { text, type: 'success'|'error' }
    const listContainerRef = React.useRef(null);
    
    useEffect(() => {
        if (!toastMessage) return;
        const t = setTimeout(() => setToastMessage(null), 4000);
        return () => clearTimeout(t);
    }, [toastMessage]);
    
    // Load tickets
    const loadTickets = useCallback(async () => {
        try {
            setIsLoading(true);
            setLoadError(null);
            
            const params = new URLSearchParams();
            if (filterStatus !== 'all') params.append('status', filterStatus);
            if (filterPriority !== 'all') params.append('priority', filterPriority);
            if (filterCategory !== 'all') params.append('category', filterCategory);
            if (filterSubmittedByMe && user?.id) params.append('createdBy', user.id);
            if (filterAssignedToMe && user?.id) params.append('assignedTo', user.id);
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
            
            // Handle response format: API returns { data: { tickets: [...], pagination: {...} } }
            const ticketsData = response?.tickets || response?.data?.tickets;
            
            if (ticketsData && Array.isArray(ticketsData)) {
                console.log(`✅ Loaded ${ticketsData.length} tickets from API`);
                setTickets(ticketsData);
            } else {
                console.warn('⚠️ No tickets in response:', {
                    hasResponse: !!response,
                    hasTickets: !!response?.tickets,
                    hasDataTickets: !!response?.data?.tickets,
                    responseKeys: response ? Object.keys(response) : []
                });
                setTickets([]);
            }
        } catch (error) {
            console.error('Error loading tickets:', error);
            setLoadError(error.message || 'Failed to load tickets');
            setTickets([]);
        } finally {
            setIsLoading(false);
        }
    }, [filterStatus, filterPriority, filterCategory, filterSubmittedByMe, filterAssignedToMe, searchTerm, user?.id]);

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
                    if (window.DatabaseAPI?.invalidateHelpdeskCache) window.DatabaseAPI.invalidateHelpdeskCache();
                    setTickets(prev => prev.map(t => t.id === savedTicket.id ? savedTicket : t));
                    setShowModal(false);
                    setSelectedTicket(null);
                    setTimeout(async () => {
                        await loadTickets();
                    }, 300);
                } else {
                    throw new Error('No ticket data in response');
                }
                setToastMessage({ text: 'Ticket updated.', type: 'success' });
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
                    if (window.DatabaseAPI?.invalidateHelpdeskCache) window.DatabaseAPI.invalidateHelpdeskCache();
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
                    
                    // Close modal first so user sees the ticket immediately
                    setShowModal(false);
                    setSelectedTicket(null);
                    
                    setToastMessage({ text: 'Ticket created.', type: 'success' });
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
            setToastMessage({ text: `Save failed: ${error.message}`, type: 'error' });
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
            if (window.DatabaseAPI?.invalidateHelpdeskCache) window.DatabaseAPI.invalidateHelpdeskCache();
            setTickets(prev => prev.filter(t => t.id !== ticketId));
            setShowModal(false);
            setSelectedTicket(null);
            setToastMessage({ text: 'Ticket deleted.', type: 'success' });
        } catch (error) {
            console.error('Error deleting ticket:', error);
            setToastMessage({ text: `Delete failed: ${error.message}`, type: 'error' });
        }
    }, []);

    // Handle close modal
    const handleCloseModal = useCallback(() => {
        setShowModal(false);
        setSelectedTicket(null);
    }, []);

    // Kanban: update ticket status when dropped in another column
    const handleUpdateTicketStatus = useCallback(async (ticketId, newStatus) => {
        try {
            if (window.DatabaseAPI?.makeRequest) {
                await window.DatabaseAPI.makeRequest(`/helpdesk/${ticketId}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ status: newStatus }),
                    headers: { 'Content-Type': 'application/json' }
                });
            } else {
                const res = await fetch(`/api/helpdesk/${ticketId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ status: newStatus })
                });
                if (!res.ok) throw new Error(await res.text());
            }
            if (window.DatabaseAPI?.invalidateHelpdeskCache) window.DatabaseAPI.invalidateHelpdeskCache();
            setTickets((prev) => prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t)));
            setToastMessage({ text: 'Status updated.', type: 'success' });
        } catch (err) {
            setToastMessage({ text: `Failed to update status: ${err.message || err}`, type: 'error' });
        }
    }, []);

    // Filtered tickets (must be declared before any useEffect that uses it)
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

    // Keyboard nav: arrow keys + Enter on list (only when list view, list visible, modal closed)
    useEffect(() => {
        if (viewMode !== 'list' || showModal || filteredTickets.length === 0) {
            setFocusedIndex(-1);
            return;
        }
        const onKeyDown = (e) => {
            const target = e.target;
            if (!listContainerRef.current || !listContainerRef.current.contains(target)) return;
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) return;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setFocusedIndex((i) => (i < filteredTickets.length - 1 ? i + 1 : i));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setFocusedIndex((i) => (i <= 0 ? -1 : i - 1));
            } else if (e.key === 'Enter' && focusedIndex >= 0 && filteredTickets[focusedIndex]) {
                e.preventDefault();
                handleViewTicket(filteredTickets[focusedIndex]);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [viewMode, showModal, filteredTickets, focusedIndex, handleViewTicket]);

    // Reset focused index when list changes
    useEffect(() => {
        setFocusedIndex((i) => (i >= filteredTickets.length ? Math.max(-1, filteredTickets.length - 1) : i));
    }, [filteredTickets.length]);

    // Move DOM focus to the focused row when focusedIndex changes (keyboard nav)
    useEffect(() => {
        if (focusedIndex < 0 || !listContainerRef.current) return;
        const row = listContainerRef.current.querySelector(`[data-ticket-index="${focusedIndex}"]`);
        if (row && typeof row.focus === 'function') {
            row.focus();
            row.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
        }
    }, [focusedIndex]);

    // Check if TicketDetailModal is available
    const TicketDetailModal = window.TicketDetailModal;

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            {/* Inline success/error message */}
            {toastMessage && (
                <div
                    role="status"
                    aria-live="polite"
                    className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 ${
                        toastMessage.type === 'error'
                            ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border-b border-red-200 dark:border-red-800'
                            : 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border-b border-green-200 dark:border-green-800'
                    }`}
                >
                    <p className="text-sm font-medium">{toastMessage.text}</p>
                </div>
            )}
            {/* Header */}
            <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white">
                                <i className="fas fa-headset mr-2"></i>
                                Helpdesk
                            </h1>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
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

                        {/* Submitted by me / Assigned to me */}
                        {user?.id && (
                            <>
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={filterSubmittedByMe}
                                        onChange={(e) => setFilterSubmittedByMe(e.target.checked)}
                                        className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                                        aria-label="Submitted by me"
                                    />
                                    <span className="text-sm text-gray-700 dark:text-gray-300">Submitted by me</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={filterAssignedToMe}
                                        onChange={(e) => setFilterAssignedToMe(e.target.checked)}
                                        className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                                        aria-label="Assigned to me"
                                    />
                                    <span className="text-sm text-gray-700 dark:text-gray-300">Assigned to me</span>
                                </label>
                            </>
                        )}

                        {/* View Mode Toggle */}
                        <div className="flex items-center space-x-2">
                            <button
                                type="button"
                                onClick={() => setViewMode('list')}
                                className={`px-3 py-2 rounded-lg transition-colors ${
                                    viewMode === 'list'
                                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                                aria-label="List view"
                                aria-pressed={viewMode === 'list'}
                            >
                                <i className="fas fa-list" aria-hidden="true"></i>
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('grid')}
                                className={`px-3 py-2 rounded-lg transition-colors ${
                                    viewMode === 'grid'
                                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                                aria-label="Grid view"
                                aria-pressed={viewMode === 'grid'}
                            >
                                <i className="fas fa-th" aria-hidden="true"></i>
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('kanban')}
                                className={`px-3 py-2 rounded-lg transition-colors ${
                                    viewMode === 'kanban'
                                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                                }`}
                                aria-label="Kanban view"
                                aria-pressed={viewMode === 'kanban'}
                            >
                                <i className="fas fa-columns" aria-hidden="true"></i>
                            </button>
                        </div>
                        {/* List density (list view only) */}
                        {viewMode === 'list' && (
                            <div className="flex items-center gap-1" role="group" aria-label="List density">
                                <button
                                    type="button"
                                    onClick={() => setListDensity('comfortable')}
                                    className={`px-2 py-1.5 text-xs rounded ${
                                        listDensity === 'comfortable'
                                            ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white font-medium'
                                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'
                                    }`}
                                    aria-label="Comfortable density"
                                    aria-pressed={listDensity === 'comfortable'}
                                >
                                    Comfortable
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setListDensity('compact')}
                                    className={`px-2 py-1.5 text-xs rounded ${
                                        listDensity === 'compact'
                                            ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-white font-medium'
                                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'
                                    }`}
                                    aria-label="Compact density"
                                    aria-pressed={listDensity === 'compact'}
                                >
                                    Compact
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {isLoading ? (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                    {['Ticket', 'Status', 'Priority', 'Category', 'Assigned To', 'Client', 'Project', 'Submitted By', 'Due', 'Created'].map((h) => (
                                        <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {[1, 2, 3, 4, 5].map((i) => (
                                    <tr key={i}>
                                        <td className="px-6 py-4"><div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-32 animate-pulse" /></td>
                                        <td className="px-6 py-4"><div className="h-5 bg-gray-200 dark:bg-gray-600 rounded w-20 animate-pulse" /></td>
                                        <td className="px-6 py-4"><div className="h-5 bg-gray-200 dark:bg-gray-600 rounded w-16 animate-pulse" /></td>
                                        <td className="px-6 py-4"><div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-20 animate-pulse" /></td>
                                        <td className="px-6 py-4"><div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-24 animate-pulse" /></td>
                                        <td className="px-6 py-4"><div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-20 animate-pulse" /></td>
                                        <td className="px-6 py-4"><div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-24 animate-pulse" /></td>
                                        <td className="px-6 py-4"><div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-20 animate-pulse" /></td>
                                        <td className="px-6 py-4"><div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-16 animate-pulse" /></td>
                                        <td className="px-6 py-4"><div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-20 animate-pulse" /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <p className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">Loading tickets...</p>
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
                            {(searchTerm || filterStatus !== 'all' || filterPriority !== 'all' || filterCategory !== 'all' || filterSubmittedByMe || filterAssignedToMe)
                                ? 'Try adjusting your filters'
                                : 'Create your first ticket to get started'}
                        </p>
                        <div className="flex flex-wrap justify-center gap-2">
                            {(searchTerm || filterStatus !== 'all' || filterPriority !== 'all' || filterCategory !== 'all' || filterSubmittedByMe || filterAssignedToMe) && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSearchTerm('');
                                        setFilterStatus('all');
                                        setFilterPriority('all');
                                        setFilterCategory('all');
                                        setFilterSubmittedByMe(false);
                                        setFilterAssignedToMe(false);
                                    }}
                                    className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500"
                                >
                                    Clear filters
                                </button>
                            )}
                            {!searchTerm && filterStatus === 'all' && filterPriority === 'all' && filterCategory === 'all' && !filterSubmittedByMe && !filterAssignedToMe && (
                                <button
                                    onClick={handleCreateTicket}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                >
                                    Create Ticket
                                </button>
                            )}
                        </div>
                    </div>
                ) : viewMode === 'list' ? (
                    <div
                        ref={listContainerRef}
                        tabIndex={0}
                        className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
                        aria-label="Ticket list. Use arrow keys to move, Enter to open."
                    >
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                    <th className={`text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider ${listDensity === 'compact' ? 'px-4 py-2' : 'px-6 py-3'}`}>
                                        Ticket
                                    </th>
                                    <th className={`text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider ${listDensity === 'compact' ? 'px-4 py-2' : 'px-6 py-3'}`}>Status</th>
                                    <th className={`text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider ${listDensity === 'compact' ? 'px-4 py-2' : 'px-6 py-3'}`}>Priority</th>
                                    <th className={`text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider ${listDensity === 'compact' ? 'px-4 py-2' : 'px-6 py-3'}`}>Category</th>
                                    <th className={`text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider ${listDensity === 'compact' ? 'px-4 py-2' : 'px-6 py-3'}`}>Assigned To</th>
                                    <th className={`text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider ${listDensity === 'compact' ? 'px-4 py-2' : 'px-6 py-3'}`}>Client</th>
                                    <th className={`text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider ${listDensity === 'compact' ? 'px-4 py-2' : 'px-6 py-3'}`}>Project</th>
                                    <th className={`text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider ${listDensity === 'compact' ? 'px-4 py-2' : 'px-6 py-3'}`}>Submitted By</th>
                                    <th className={`text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider ${listDensity === 'compact' ? 'px-4 py-2' : 'px-6 py-3'}`}>Due</th>
                                    <th className={`text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider ${listDensity === 'compact' ? 'px-4 py-2' : 'px-6 py-3'}`}>Created</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {filteredTickets.map((ticket, index) => {
                                    const isFocused = focusedIndex === index;
                                    const cellPad = listDensity === 'compact' ? 'px-4 py-2' : 'px-6 py-4';
                                    const cellText = listDensity === 'compact' ? 'text-xs' : 'text-sm';
                                    return (
                                    <tr
                                        key={ticket.id}
                                        data-ticket-index={index}
                                        onClick={() => handleViewTicket(ticket)}
                                        onFocus={() => setFocusedIndex(index)}
                                        className={`cursor-pointer transition-colors ${isFocused ? 'bg-blue-50 dark:bg-blue-900/30 ring-1 ring-inset ring-blue-200 dark:ring-blue-700' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                                        tabIndex={isFocused || focusedIndex < 0 && index === 0 ? 0 : -1}
                                        aria-label={`${ticket.ticketNumber} ${ticket.title}, ${ticket.status}. Press Enter to open.`}
                                    >
                                        <td className={`${cellPad} whitespace-nowrap ${cellText}`}>
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-2">
                                                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                                                        {ticket.ticketNumber}
                                                    </div>
                                                    {ticket.type === 'email' && (
                                                        <span className="px-2 py-0.5 text-xs font-semibold rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" title="Created from email">
                                                            <i className="fas fa-envelope mr-1"></i>Email
                                                        </span>
                                                    )}
                                                    {ticket.type === 'internal' && (
                                                        <span className="px-2 py-0.5 text-xs font-semibold rounded bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300" title="Created manually">
                                                            <i className="fas fa-user mr-1"></i>Manual
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                                    {ticket.title}
                                                </div>
                                            </div>
                                        </td>
                                        <td className={`${cellPad} whitespace-nowrap ${cellText}`}>
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full border ${getStatusColorClasses(ticket.status)}`}>
                                                {ticket.status}
                                            </span>
                                        </td>
                                        <td className={`${cellPad} whitespace-nowrap ${cellText}`}>
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getPriorityColorClasses(ticket.priority)}`}>
                                                {ticket.priority}
                                            </span>
                                        </td>
                                        <td className={`${cellPad} whitespace-nowrap ${cellText} text-gray-500 dark:text-gray-400`}>
                                            {ticket.category}
                                        </td>
                                        <td className={`${cellPad} whitespace-nowrap ${cellText} text-gray-500 dark:text-gray-400`} onClick={(e) => e.stopPropagation()}>
                                            {ticket.assignedTo ? (
                                                <a
                                                    href={`#/users/${ticket.assignedTo.id || ticket.assignedToId}`}
                                                    className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline"
                                                    title="View user"
                                                >
                                                    {ticket.assignedTo.avatar && (
                                                        <img
                                                            src={ticket.assignedTo.avatar}
                                                            alt=""
                                                            className="w-6 h-6 rounded-full flex-shrink-0"
                                                        />
                                                    )}
                                                    <span>{ticket.assignedTo.name || ticket.assignedTo.email}</span>
                                                </a>
                                            ) : (
                                                <span className="text-gray-400">Unassigned</span>
                                            )}
                                        </td>
                                        <td className={`${cellPad} whitespace-nowrap ${cellText} text-gray-500 dark:text-gray-400`} onClick={(e) => e.stopPropagation()}>
                                            {ticket.clientId && ticket.client ? (
                                                <a
                                                    href={`#/clients/${ticket.clientId}`}
                                                    className="text-blue-600 dark:text-blue-400 hover:underline"
                                                    title="View client"
                                                >
                                                    {ticket.client.name}
                                                </a>
                                            ) : (
                                                <span className="text-gray-400">—</span>
                                            )}
                                        </td>
                                        <td className={`${cellPad} whitespace-nowrap ${cellText} text-gray-500 dark:text-gray-400`} onClick={(e) => e.stopPropagation()}>
                                            {ticket.projectId && ticket.project ? (
                                                <a
                                                    href={`#/projects/${ticket.projectId}`}
                                                    className="text-blue-600 dark:text-blue-400 hover:underline"
                                                    title="View project"
                                                >
                                                    {ticket.project.name}
                                                </a>
                                            ) : (
                                                <span className="text-gray-400">—</span>
                                            )}
                                        </td>
                                        <td className={`${cellPad} whitespace-nowrap ${cellText} text-gray-500 dark:text-gray-400`}>
                                            {ticket.createdBy ? (
                                                <span>{ticket.createdBy.name || ticket.createdBy.email}</span>
                                            ) : (
                                                <span className="text-gray-400">—</span>
                                            )}
                                        </td>
                                        <td className={`${cellPad} whitespace-nowrap ${cellText} text-gray-500 dark:text-gray-400`}>
                                            {ticket.dueDate ? (
                                                <span className={isTicketOverdue(ticket) ? 'text-red-600 dark:text-red-400 font-medium' : ''}>
                                                    {new Date(ticket.dueDate).toLocaleDateString()}
                                                    {isTicketOverdue(ticket) && (
                                                        <span className="ml-1 px-1.5 py-0.5 text-xs font-semibold rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" title="Past due">Overdue</span>
                                                    )}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400">—</span>
                                            )}
                                        </td>
                                        <td className={`${cellPad} whitespace-nowrap ${cellText} text-gray-500 dark:text-gray-400`}>
                                            {new Date(ticket.createdAt).toLocaleDateString()}
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : viewMode === 'kanban' ? (
                    <div className="flex gap-4 overflow-x-auto pb-4 min-h-[500px]">
                        {KANBAN_STATUS_COLUMNS.map((col) => {
                            const columnTickets = filteredTickets.filter((t) => (t.status || 'open') === col.value);
                            const handleDragOver = (e) => {
                                e.preventDefault();
                                e.currentTarget.classList.add('ring-2', 'ring-blue-400', 'bg-blue-50/50', 'dark:bg-blue-900/20');
                            };
                            const handleDragLeave = (e) => {
                                e.currentTarget.classList.remove('ring-2', 'ring-blue-400', 'bg-blue-50/50', 'dark:bg-blue-900/20');
                            };
                            const handleDrop = (e) => {
                                e.preventDefault();
                                e.currentTarget.classList.remove('ring-2', 'ring-blue-400', 'bg-blue-50/50', 'dark:bg-blue-900/20');
                                const ticketId = e.dataTransfer.getData('ticketId');
                                if (ticketId && col.value) handleUpdateTicketStatus(ticketId, col.value);
                            };
                            return (
                                <div
                                    key={col.value}
                                    role="region"
                                    aria-label={`${col.label}, ${columnTickets.length} tickets. Drop here to set status to ${col.label}.`}
                                    className="flex-shrink-0 w-72 rounded-lg border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50"
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                >
                                    <div className={`rounded-t-lg px-3 py-2.5 border-b-2 ${getStatusColorClasses(col.value)}`}>
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{col.label}</h3>
                                            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-white/50 dark:bg-black/20">
                                                {columnTickets.length}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="p-2 min-h-[400px] space-y-2">
                                        {columnTickets.length === 0 ? (
                                            <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
                                                <i className="fas fa-inbox text-2xl mb-2 block" aria-hidden="true"></i>
                                                No tickets
                                            </div>
                                        ) : (
                                            columnTickets.map((ticket) => (
                                                <div
                                                    key={ticket.id}
                                                    draggable
                                                    onDragStart={(e) => {
                                                        e.dataTransfer.setData('ticketId', ticket.id);
                                                        e.dataTransfer.effectAllowed = 'move';
                                                    }}
                                                    onClick={() => handleViewTicket(ticket)}
                                                    className="bg-white dark:bg-gray-700 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-move border border-gray-200 dark:border-gray-600"
                                                >
                                                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                                                        {ticket.ticketNumber}
                                                    </div>
                                                    <div className="text-sm font-medium text-gray-900 dark:text-white mb-1.5 line-clamp-2">
                                                        {ticket.title || 'Untitled'}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${getPriorityColorClasses(ticket.priority)}`}>
                                                            {ticket.priority}
                                                        </span>
                                                        {ticket.dueDate && (
                                                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${isTicketOverdue(ticket) ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-600 dark:text-gray-300'}`}>
                                                                {isTicketOverdue(ticket) ? 'Overdue' : new Date(ticket.dueDate).toLocaleDateString()}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {ticket.assignedTo && (
                                                        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-600 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                            <a
                                                                href={`#/users/${ticket.assignedTo.id || ticket.assignedToId}`}
                                                                className="flex items-center gap-1.5 text-[10px] text-blue-600 dark:text-blue-400 hover:underline truncate min-w-0"
                                                                title="View user"
                                                            >
                                                                {ticket.assignedTo.avatar ? (
                                                                    <img src={ticket.assignedTo.avatar} alt="" className="w-5 h-5 rounded-full flex-shrink-0" />
                                                                ) : (
                                                                    <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] flex items-center justify-center font-semibold flex-shrink-0">
                                                                        {(ticket.assignedTo.name || ticket.assignedTo.email || '?').charAt(0).toUpperCase()}
                                                                    </span>
                                                                )}
                                                                <span className="truncate">{ticket.assignedTo.name || ticket.assignedTo.email}</span>
                                                            </a>
                                                        </div>
                                                    )}
                                                    {(ticket.clientId || ticket.projectId) && (
                                                        <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-gray-500 dark:text-gray-400" onClick={(e) => e.stopPropagation()}>
                                                            {ticket.clientId && ticket.client && (
                                                                <a href={`#/clients/${ticket.clientId}`} className="text-blue-600 dark:text-blue-400 hover:underline truncate">{(ticket.client.name)}</a>
                                                            )}
                                                            {ticket.projectId && ticket.project && (
                                                                <a href={`#/projects/${ticket.projectId}`} className="text-blue-600 dark:text-blue-400 hover:underline truncate">{(ticket.project.name)}</a>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            );
                        })}
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
                                    <div className="flex items-center gap-2">
                                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                                            {ticket.ticketNumber}
                                        </div>
                                        {ticket.type === 'email' && (
                                            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" title="Created from email">
                                                <i className="fas fa-envelope"></i>
                                            </span>
                                        )}
                                        {ticket.type === 'internal' && (
                                            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300" title="Created manually">
                                                <i className="fas fa-user"></i>
                                            </span>
                                        )}
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

