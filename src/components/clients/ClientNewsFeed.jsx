// Get dependencies from window
const { useState, useEffect, useMemo } = React;

/**
 * CLIENT NEWS FEED COMPONENT
 * 
 * Features:
 * - Displays activities across all clients
 * - Shows daily news articles related to clients
 * - Highlights new news stories
 * - Filters by client and date
 */

const ClientNewsFeed = () => {
    const [activities, setActivities] = useState([]);
    const [newsArticles, setNewsArticles] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedClient, setSelectedClient] = useState('all');
    const [clients, setClients] = useState([]);
    const [filterDate, setFilterDate] = useState('all'); // all, today, week, month
    const [activeTab, setActiveTab] = useState('activities'); // activities, news
    
    // Get theme
    const { isDark } = window.useTheme ? window.useTheme() : { isDark: false };

    // Load clients and data
    useEffect(() => {
        loadClients();
        loadActivities();
        loadNewsArticles();
    }, [selectedClient, filterDate]);

    const loadClients = async () => {
        try {
            // Load both clients and leads
            const clientsResponse = await window.DatabaseAPI?.getClients();
            const leadsResponse = await window.DatabaseAPI?.getLeads?.();
            
            let allClients = [];
            if (clientsResponse?.data?.clients) {
                allClients = [...clientsResponse.data.clients];
            }
            if (leadsResponse?.data?.leads) {
                allClients = [...allClients, ...leadsResponse.data.leads];
            }
            
            setClients(allClients);
        } catch (error) {
            console.error('Failed to load clients and leads:', error);
        }
    };

    const loadActivities = async () => {
        setIsLoading(true);
        try {
            
            // Fetch activities from all clients' and leads' activityLogs
            const clientsResponse = await window.DatabaseAPI?.getClients();
            const leadsResponse = await window.DatabaseAPI?.getLeads?.();
            
            
            const allActivities = [];
            
            // Process clients - check multiple possible response structures
            let clients = [];
            if (clientsResponse?.data?.clients) {
                clients = clientsResponse.data.clients;
            } else if (Array.isArray(clientsResponse?.data)) {
                clients = clientsResponse.data;
            } else if (Array.isArray(clientsResponse)) {
                clients = clientsResponse;
            }
            
            
            clients.forEach(client => {
                // Only process actual clients (type === 'client' or null/undefined)
                if (client.type === 'lead') {
                    return; // Skip leads in clients response
                }
                
                const activityLog = Array.isArray(client.activityLog) 
                    ? client.activityLog 
                    : (typeof client.activityLog === 'string' ? JSON.parse(client.activityLog || '[]') : []);
                
                
                activityLog.forEach(activity => {
                    allActivities.push({
                        ...activity,
                        clientId: client.id,
                        clientName: client.name,
                        clientType: 'client',
                        timestamp: activity.timestamp || activity.createdAt || new Date().toISOString()
                    });
                });
            });
            
            // Process leads - check multiple possible response structures
            let leads = [];
            if (leadsResponse?.data?.leads) {
                leads = leadsResponse.data.leads;
            } else if (Array.isArray(leadsResponse?.data)) {
                leads = leadsResponse.data;
            } else if (Array.isArray(leadsResponse)) {
                leads = leadsResponse;
            }
            
            
            leads.forEach(lead => {
                // Only process actual leads
                if (lead.type === 'client') {
                    return; // Skip clients in leads response
                }
                
                const activityLog = Array.isArray(lead.activityLog) 
                    ? lead.activityLog 
                    : (typeof lead.activityLog === 'string' ? JSON.parse(lead.activityLog || '[]') : []);
                
                
                activityLog.forEach(activity => {
                    allActivities.push({
                        ...activity,
                        clientId: lead.id,
                        clientName: lead.name,
                        clientType: 'lead',
                        timestamp: activity.timestamp || activity.createdAt || new Date().toISOString()
                    });
                });
            });
            

                // Filter by client if selected
                let filtered = allActivities;
                if (selectedClient !== 'all') {
                    filtered = allActivities.filter(a => a.clientId === selectedClient);
                }

                // Filter by date
                if (filterDate !== 'all') {
                    const now = new Date();
                    filtered = filtered.filter(a => {
                        const activityDate = new Date(a.timestamp);
                        switch (filterDate) {
                            case 'today':
                                return activityDate.toDateString() === now.toDateString();
                            case 'week':
                                const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                                return activityDate >= weekAgo;
                            case 'month':
                                const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                                return activityDate >= monthAgo;
                            default:
                                return true;
                        }
                    });
                }

                // Sort by timestamp (newest first)
                filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                
                setActivities(filtered);
        } catch (error) {
            console.error('Failed to load activities:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const loadNewsArticles = async () => {
        try {
            
            // Get token using the same method as other components
            const token = window.storage?.getToken?.();
            
            if (!token) {
                console.warn('📰 No authentication token available');
                setNewsArticles([]);
                return;
            }
            
            // Add cache-busting timestamp to ensure fresh data
            const timestamp = Date.now();
            const response = await fetch(`/api/client-news?_t=${timestamp}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                },
                credentials: 'include'
            });
            
            
            if (response.ok) {
                const data = await response.json();
                
                // API returns { data: { newsArticles: [...] } }
                let articles = data?.data?.newsArticles || data?.newsArticles || [];
                
                // Log client IDs and subscription status for debugging
                if (articles.length > 0) {
                    const clientIds = [...new Set(articles.map(a => a.clientId))];
                }
                
                // Filter by client if selected
                if (selectedClient !== 'all') {
                    articles = articles.filter(a => a.clientId === selectedClient);
                }

                // Filter by date
                if (filterDate !== 'all') {
                    const now = new Date();
                    articles = articles.filter(a => {
                        const articleDate = new Date(a.publishedAt || a.createdAt);
                        switch (filterDate) {
                            case 'today':
                                return articleDate.toDateString() === now.toDateString();
                            case 'week':
                                const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                                return articleDate >= weekAgo;
                            case 'month':
                                const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                                return articleDate >= monthAgo;
                            default:
                                return true;
                        }
                    });
                }

                // Sort by published date (newest first)
                articles.sort((a, b) => new Date(b.publishedAt || b.createdAt) - new Date(a.publishedAt || a.createdAt));
                
                setNewsArticles(articles);
            } else {
                console.error('📰 API response not OK:', response.status, response.statusText);
                const errorText = await response.text();
                console.error('📰 Error response:', errorText);
            }
        } catch (error) {
            console.error('📰 Failed to load news articles:', error);
            console.error('📰 Error details:', error.message, error.stack);
        }
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
    };

    const getActivityIcon = (type) => {
        const iconMap = {
            'contact': 'fa-phone',
            'meeting': 'fa-calendar',
            'email': 'fa-envelope',
            'note': 'fa-sticky-note',
            'project': 'fa-project-diagram',
            'invoice': 'fa-file-invoice',
            'opportunity': 'fa-bullseye',
            'Lead Converted': 'fa-star',
            'Status Changed': 'fa-sync',
            'default': 'fa-circle'
        };
        return iconMap[type] || iconMap['default'];
    };

    const getActivityColor = (type) => {
        const colorMap = {
            'contact': 'bg-blue-100 text-blue-800',
            'meeting': 'bg-purple-100 text-purple-800',
            'email': 'bg-green-100 text-green-800',
            'note': 'bg-yellow-100 text-yellow-800',
            'project': 'bg-indigo-100 text-indigo-800',
            'invoice': 'bg-orange-100 text-orange-800',
            'opportunity': 'bg-pink-100 text-pink-800',
            'Lead Converted': 'bg-green-100 text-green-800',
            'Status Changed': 'bg-gray-100 text-gray-800',
            'default': 'bg-gray-100 text-gray-800'
        };
        return colorMap[type] || colorMap['default'];
    };

    const isNewArticle = (article) => {
        const publishedDate = new Date(article.publishedAt || article.createdAt);
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        return publishedDate >= dayAgo;
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className={`text-xl sm:text-2xl font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Client News Feed</h1>
                    <p className={`text-sm mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        Stay updated with client and lead activities and news
                    </p>
                </div>
                <button
                    onClick={() => {
                        loadActivities();
                        loadNewsArticles();
                    }}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 flex items-center gap-2 text-sm font-medium"
                >
                    <i className="fas fa-sync-alt"></i>
                    Refresh
                </button>
            </div>

            {/* Tabs */}
            <div className={`${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} rounded-xl border p-1.5 inline-flex gap-1`}>
                <button
                    onClick={() => setActiveTab('activities')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        activeTab === 'activities'
                            ? isDark ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'
                            : isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <i className="fas fa-bell mr-2"></i>
                    Activities ({activities.length})
                </button>
                <button
                    onClick={() => setActiveTab('news')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        activeTab === 'news'
                            ? isDark ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'
                            : isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <i className="fas fa-newspaper mr-2"></i>
                    News ({newsArticles.length})
                    {newsArticles.filter(isNewArticle).length > 0 && (
                        <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                            {newsArticles.filter(isNewArticle).length} new
                        </span>
                    )}
                </button>
            </div>

            {/* Filters */}
            <div className={`${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} rounded-xl border p-5 flex flex-wrap gap-4 shadow-sm`}>
                <div className="flex-1 min-w-[200px]">
                    <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                        Client
                    </label>
                    <select
                        value={selectedClient}
                        onChange={(e) => setSelectedClient(e.target.value)}
                        className={`w-full px-4 py-3 border rounded-lg text-sm transition-colors ${
                            isDark 
                                ? 'bg-gray-800 border-gray-700 text-gray-200 focus:bg-gray-800' 
                                : 'bg-gray-50 border-gray-200 text-gray-900 focus:bg-white'
                        }`}
                    >
                        <option value="all">All Clients & Leads</option>
                        {clients
                            .sort((a, b) => {
                                // Sort: clients first, then leads, then alphabetically
                                const aType = a.type || 'client';
                                const bType = b.type || 'client';
                                if (aType !== bType) {
                                    return aType === 'client' ? -1 : 1;
                                }
                                return a.name.localeCompare(b.name);
                            })
                            .map(client => (
                                <option key={client.id} value={client.id}>
                                    {client.name} {client.type === 'lead' ? '(Lead)' : '(Client)'}
                                </option>
                            ))}
                    </select>
                </div>
                <div className="flex-1 min-w-[200px]">
                    <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                        Date Range
                    </label>
                    <select
                        value={filterDate}
                        onChange={(e) => setFilterDate(e.target.value)}
                        className={`w-full px-4 py-3 border rounded-lg text-sm transition-colors ${
                            isDark 
                                ? 'bg-gray-800 border-gray-700 text-gray-200 focus:bg-gray-800' 
                                : 'bg-gray-50 border-gray-200 text-gray-900 focus:bg-white'
                        }`}
                    >
                        <option value="all">All Time</option>
                        <option value="today">Today</option>
                        <option value="week">Last 7 Days</option>
                        <option value="month">Last 30 Days</option>
                    </select>
                </div>
            </div>

            {/* Content */}
            {isLoading ? (
                <div className={`${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} rounded-xl border p-8 text-center shadow-sm`}>
                    <i className={`fas fa-spinner fa-spin text-3xl mb-4 ${isDark ? 'text-gray-400' : 'text-gray-400'}`}></i>
                    <p className={isDark ? 'text-gray-400' : 'text-gray-500'}>Loading...</p>
                </div>
            ) : activeTab === 'activities' ? (
                /* Activities Feed */
                <div className="space-y-3">
                    {activities.length === 0 ? (
                        <div className={`${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} rounded-xl border p-8 text-center shadow-sm`}>
                            <i className={`fas fa-inbox text-3xl mb-4 ${isDark ? 'text-gray-500' : 'text-gray-300'}`}></i>
                            <p className={isDark ? 'text-gray-400' : 'text-gray-500'}>No activities found</p>
                        </div>
                    ) : (
                        activities.map((activity, index) => (
                            <div
                                key={`activity-${activity.clientId}-${index}`}
                                className={`${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} rounded-xl border p-4 hover:shadow-md transition-all duration-200`}
                            >
                                <div className="flex items-start gap-3">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getActivityColor(activity.type)}`}>
                                        <i className={`fas ${getActivityIcon(activity.type)} text-sm`}></i>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                            <span className={`font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                {activity.clientName}
                                            </span>
                                            {activity.clientType === 'lead' && (
                                                <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                                                    isDark ? 'bg-yellow-900 text-yellow-200' : 'bg-yellow-100 text-yellow-800'
                                                }`}>
                                                    Lead
                                                </span>
                                            )}
                                            <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                {formatDate(activity.timestamp)}
                                            </span>
                                        </div>
                                        <div className={`text-sm mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                            <span className="font-medium capitalize">{activity.type}</span>
                                            {activity.description && `: ${activity.description}`}
                                        </div>
                                        {activity.user && (
                                            <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                by {activity.user}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            ) : (
                /* News Feed */
                <div className="space-y-3">
                    {newsArticles.length === 0 ? (
                        <div className={`${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} rounded-xl border p-8 text-center shadow-sm`}>
                            <i className={`fas fa-newspaper text-3xl mb-4 ${isDark ? 'text-gray-500' : 'text-gray-300'}`}></i>
                            <p className={`mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>No news articles found</p>
                            <p className={`text-xs mb-4 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                                {isLoading ? 'Loading articles...' : 'News articles are automatically fetched daily. Check back tomorrow for updates.'}
                            </p>
                            <button
                                onClick={() => {
                                    loadNewsArticles();
                                }}
                                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 text-sm font-medium"
                            >
                                <i className="fas fa-sync-alt mr-2"></i>
                                Refresh Articles
                            </button>
                            <p className={`text-xs mt-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                Check browser console (F12) for debug info
                            </p>
                        </div>
                    ) : (
                        newsArticles.map((article) => (
                            <div
                                key={article.id}
                                className={`${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} rounded-xl border ${
                                    isNewArticle(article) 
                                        ? isDark ? 'border-blue-600 shadow-md' : 'border-blue-500 shadow-md'
                                        : ''
                                } p-4 hover:shadow-md transition-all duration-200`}
                            >
                                <div className="flex items-start gap-3">
                                    {isNewArticle(article) && (
                                        <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                            <div className="flex items-center gap-2">
                                                <i className={`fas ${article.clientType === 'lead' ? 'fa-star' : 'fa-building'} text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}></i>
                                                <span className={`font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                    {article.clientName || 'Unknown Client'}
                                                </span>
                                                <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                                                    article.clientType === 'lead' 
                                                        ? isDark ? 'bg-yellow-900 text-yellow-200' : 'bg-yellow-100 text-yellow-800'
                                                        : isDark ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-800'
                                                }`}>
                                                    {article.clientType === 'lead' ? 'Lead' : 'Client'}
                                                </span>
                                            </div>
                                            {isNewArticle(article) && (
                                                <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                                                    isDark ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-800'
                                                }`}>
                                                    NEW
                                                </span>
                                            )}
                                            <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                {formatDate(article.publishedAt || article.createdAt)}
                                            </span>
                                        </div>
                                        <h3 className={`text-lg font-semibold mb-2 break-words overflow-hidden line-clamp-2 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                            {article.title}
                                        </h3>
                                        {article.description && (
                                            <p className={`text-sm mb-2 line-clamp-3 break-words overflow-hidden ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                                {article.description}
                                            </p>
                                        )}
                                        {article.url && (
                                            <div className="mb-2">
                                                <a
                                                    href={article.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline break-all overflow-hidden line-clamp-1"
                                                    title={article.url}
                                                >
                                                    {article.url}
                                                </a>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-4 mt-3 flex-wrap">
                                            {article.source && (
                                                <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                    <i className="fas fa-globe mr-1"></i>
                                                    {article.source}
                                                </span>
                                            )}
                                            {article.url && (
                                                <a
                                                    href={article.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={`text-xs hover:underline flex items-center gap-1 ${
                                                        isDark ? 'text-blue-400' : 'text-blue-600'
                                                    }`}
                                                >
                                                    Read more
                                                    <i className="fas fa-external-link-alt text-xs"></i>
                                                </a>
                                            )}
                                            <button
                                                onClick={async () => {
                                                    if (confirm(`Unsubscribe from news feed for ${article.clientName}? You won't receive new articles for this ${article.clientType === 'lead' ? 'lead' : 'client'} anymore.`)) {
                                                        try {
                                                            const token = window.storage?.getToken?.();
                                                            
                                                            const response = await fetch(`/api/clients/${article.clientId}/rss-subscription`, {
                                                                method: 'POST',
                                                                headers: {
                                                                    'Authorization': `Bearer ${token}`,
                                                                    'Content-Type': 'application/json',
                                                                    'Cache-Control': 'no-cache'
                                                                },
                                                                credentials: 'include',
                                                                body: JSON.stringify({ subscribed: false })
                                                            });
                                                            
                                                            if (response.ok) {
                                                                const result = await response.json();
                                                                
                                                                // Verify the unsubscribe worked
                                                                if (result.client?.rssSubscribed === false) {
                                                                } else {
                                                                    console.warn('⚠️ WARNING: Unsubscribe may not have worked - rssSubscribed is:', result.client?.rssSubscribed);
                                                                }
                                                                
                                                                // Clear any cached articles for this client
                                                                setNewsArticles(prev => prev.filter(a => a.clientId !== article.clientId));
                                                                
                                                                // Force reload news articles with cache busting
                                                                setIsLoading(true);
                                                                // Small delay to ensure database update is committed
                                                                await new Promise(resolve => setTimeout(resolve, 500));
                                                                await loadNewsArticles();
                                                                setIsLoading(false);
                                                                
                                                                alert(`Unsubscribed from ${article.clientName} news feed. Articles will no longer appear after refresh.`);
                                                            } else {
                                                                const errorText = await response.text();
                                                                console.error('❌ Unsubscribe failed:', response.status, errorText);
                                                                alert('Failed to unsubscribe. Please try again.');
                                                            }
                                                        } catch (error) {
                                                            console.error('❌ Error unsubscribing:', error);
                                                            alert('Error unsubscribing. Please try again.');
                                                        }
                                                    }
                                                }}
                                                className={`text-xs hover:underline flex items-center gap-1 ${
                                                    isDark ? 'text-red-400' : 'text-red-600'
                                                }`}
                                                title={`Unsubscribe from ${article.clientName} news feed`}
                                            >
                                                <i className="fas fa-bell-slash text-xs"></i>
                                                Unsubscribe
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

// Make available globally
window.ClientNewsFeed = ClientNewsFeed;

