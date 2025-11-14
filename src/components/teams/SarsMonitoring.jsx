// SARS Website Monitoring Component for Compliance Team
const { useState, useEffect } = React;

const SarsMonitoring = () => {
    const [changes, setChanges] = useState([]);
    const [loading, setLoading] = useState(false);
    const [checking, setChecking] = useState(false);
    const [stats, setStats] = useState({
        total: 0,
        new: 0,
        unread: 0
    });
    const [filter, setFilter] = useState({
        isNew: null,
        isRead: null,
        category: '',
        priority: ''
    });

    // Get theme state
    let themeResult = { isDark: false };
    try {
        if (window.useTheme && typeof window.useTheme === 'function') {
            themeResult = window.useTheme();
        }
    } catch (error) {
        try {
            const storedTheme = localStorage.getItem('abcotronics_theme');
            themeResult.isDark = storedTheme === 'dark';
        } catch (e) {
            themeResult.isDark = false;
        }
    }
    const isDark = themeResult?.isDark || false;

    // Load changes from API
    const loadChanges = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('abcotronics_token') || localStorage.getItem('token');
            if (!token) {
                console.error('No authentication token found');
                return;
            }

            const params = new URLSearchParams();
            if (filter.isNew !== null) params.append('isNew', filter.isNew);
            if (filter.isRead !== null) params.append('isRead', filter.isRead);
            if (filter.category) params.append('category', filter.category);
            if (filter.priority) params.append('priority', filter.priority);

            const response = await fetch(`/api/sars-monitoring/check?action=list&${params.toString()}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            if (data.success && data.data?.changes) {
                setChanges(data.data.changes);
            }
        } catch (error) {
            console.error('Error loading SARS changes:', error);
        } finally {
            setLoading(false);
        }
    };

    // Load statistics
    const loadStats = async () => {
        try {
            const token = localStorage.getItem('abcotronics_token') || localStorage.getItem('token');
            if (!token) return;

            const response = await fetch('/api/sars-monitoring/check?action=stats', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success && data.data) {
                    setStats({
                        total: data.data.total || 0,
                        new: data.data.new || 0,
                        unread: data.data.unread || 0
                    });
                }
            }
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    };

    // Trigger manual check
    const handleCheckNow = async () => {
        setChecking(true);
        try {
            const token = localStorage.getItem('abcotronics_token') || localStorage.getItem('token');
            if (!token) {
                alert('Please log in to check SARS website');
                return;
            }

            const response = await fetch('/api/sars-monitoring/check?action=check', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            if (data.success) {
                alert(`Check completed! Found ${data.results?.newChanges || 0} new changes.`);
                // Reload changes and stats
                await Promise.all([loadChanges(), loadStats()]);
            } else {
                alert('Error checking SARS website: ' + (data.message || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error checking SARS website:', error);
            alert('Error checking SARS website: ' + error.message);
        } finally {
            setChecking(false);
        }
    };

    // Mark change as read
    const handleMarkAsRead = async (id) => {
        try {
            const token = localStorage.getItem('abcotronics_token') || localStorage.getItem('token');
            if (!token) return;

            const response = await fetch('/api/sars-monitoring/check?action=mark-read', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ id })
            });

            if (response.ok) {
                // Update local state
                setChanges(changes.map(change => 
                    change.id === id ? { ...change, isRead: true } : change
                ));
                // Reload stats
                loadStats();
            }
        } catch (error) {
            console.error('Error marking as read:', error);
        }
    };

    // Load on mount and when filter changes
    useEffect(() => {
        loadChanges();
        loadStats();
    }, [filter]);

    const getPriorityColor = (priority) => {
        switch (priority) {
            case 'Critical': return isDark ? 'text-red-400 bg-red-900/30 border-red-400' : 'text-red-700 bg-red-100 border-red-500';
            case 'High': return isDark ? 'text-orange-400 bg-orange-900/30 border-orange-400' : 'text-orange-700 bg-orange-100 border-orange-500';
            case 'Medium': return isDark ? 'text-yellow-400 bg-yellow-900/30 border-yellow-400' : 'text-yellow-700 bg-yellow-100 border-yellow-500';
            default: return isDark ? 'text-blue-400 bg-blue-900/30 border-blue-400' : 'text-blue-700 bg-blue-100 border-blue-500';
        }
    };

    const getCategoryColor = (category) => {
        switch (category) {
            case 'VAT': return isDark ? 'bg-purple-900/50 text-purple-300' : 'bg-purple-100 text-purple-700';
            case 'Tax': return isDark ? 'bg-indigo-900/50 text-indigo-300' : 'bg-indigo-100 text-indigo-700';
            case 'Compliance': return isDark ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-700';
            default: return isDark ? 'bg-slate-700 text-slate-200' : 'bg-gray-100 text-gray-700';
        }
    };

    return (
        <div className="space-y-3">
            {/* Header */}
            <div className={`rounded-lg border p-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                            SARS Website Monitoring
                        </h3>
                        <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                            Monitor SARS website for regulatory updates and announcements
                        </p>
                    </div>
                    <button
                        onClick={handleCheckNow}
                        disabled={checking}
                        className={`px-3 py-1.5 text-xs rounded-lg font-medium transition ${
                            checking
                                ? 'opacity-50 cursor-not-allowed'
                                : 'hover:opacity-90'
                        } ${isDark ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-red-600 text-white hover:bg-red-700'}`}
                    >
                        {checking ? (
                            <>
                                <i className="fas fa-spinner fa-spin mr-1.5"></i>
                                Checking...
                            </>
                        ) : (
                            <>
                                <i className="fas fa-sync-alt mr-1.5"></i>
                                Check Now
                            </>
                        )}
                    </button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2">
                    <div className={`rounded p-2 ${isDark ? 'bg-slate-700' : 'bg-gray-50'}`}>
                        <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Total Changes</p>
                        <p className={`text-lg font-bold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{stats.total}</p>
                    </div>
                    <div className={`rounded p-2 ${isDark ? 'bg-red-900/30' : 'bg-red-50'}`}>
                        <p className={`text-xs ${isDark ? 'text-red-300' : 'text-red-600'}`}>New</p>
                        <p className={`text-lg font-bold ${isDark ? 'text-red-400' : 'text-red-700'}`}>{stats.new}</p>
                    </div>
                    <div className={`rounded p-2 ${isDark ? 'bg-blue-900/30' : 'bg-blue-50'}`}>
                        <p className={`text-xs ${isDark ? 'text-blue-300' : 'text-blue-600'}`}>Unread</p>
                        <p className={`text-lg font-bold ${isDark ? 'text-blue-400' : 'text-blue-700'}`}>{stats.unread}</p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className={`rounded-lg border p-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                <div className="flex items-center gap-2 flex-wrap">
                    <select
                        value={filter.isNew === null ? '' : filter.isNew.toString()}
                        onChange={(e) => setFilter({ ...filter, isNew: e.target.value === '' ? null : e.target.value === 'true' })}
                        className={`px-2 py-1 text-xs border rounded ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'border-gray-300'}`}
                    >
                        <option value="">All Changes</option>
                        <option value="true">New Only</option>
                        <option value="false">Old Only</option>
                    </select>
                    <select
                        value={filter.isRead === null ? '' : filter.isRead.toString()}
                        onChange={(e) => setFilter({ ...filter, isRead: e.target.value === '' ? null : e.target.value === 'true' })}
                        className={`px-2 py-1 text-xs border rounded ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'border-gray-300'}`}
                    >
                        <option value="">All Status</option>
                        <option value="false">Unread</option>
                        <option value="true">Read</option>
                    </select>
                    <select
                        value={filter.category}
                        onChange={(e) => setFilter({ ...filter, category: e.target.value })}
                        className={`px-2 py-1 text-xs border rounded ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'border-gray-300'}`}
                    >
                        <option value="">All Categories</option>
                        <option value="Tax">Tax</option>
                        <option value="VAT">VAT</option>
                        <option value="Compliance">Compliance</option>
                        <option value="General">General</option>
                    </select>
                    <select
                        value={filter.priority}
                        onChange={(e) => setFilter({ ...filter, priority: e.target.value })}
                        className={`px-2 py-1 text-xs border rounded ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'border-gray-300'}`}
                    >
                        <option value="">All Priorities</option>
                        <option value="Critical">Critical</option>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Normal">Normal</option>
                        <option value="Low">Low</option>
                    </select>
                </div>
            </div>

            {/* Changes List */}
            <div className={`rounded-lg border p-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                {loading ? (
                    <div className="text-center py-8">
                        <i className={`fas fa-spinner fa-spin text-3xl mb-2 ${isDark ? 'text-slate-500' : 'text-gray-300'}`}></i>
                        <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Loading changes...</p>
                    </div>
                ) : changes.length > 0 ? (
                    <div className="space-y-2">
                        {changes.map(change => (
                            <div
                                key={change.id}
                                className={`border-l-4 rounded-lg p-3 transition ${
                                    !change.isRead
                                        ? isDark ? 'bg-blue-900/20 border-blue-400' : 'bg-blue-50 border-blue-500'
                                        : isDark ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-300'
                                }`}
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                            {!change.isRead && (
                                                <span className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${isDark ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white'}`}>
                                                    NEW
                                                </span>
                                            )}
                                            <span className={`px-2 py-0.5 text-xs rounded border ${getPriorityColor(change.priority)}`}>
                                                {change.priority}
                                            </span>
                                            <span className={`px-2 py-0.5 text-xs rounded ${getCategoryColor(change.category)}`}>
                                                {change.category}
                                            </span>
                                        </div>
                                        <h4 className={`font-semibold text-sm mb-1 ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                                            {change.title}
                                        </h4>
                                        {change.description && (
                                            <p className={`text-xs mb-2 line-clamp-2 ${isDark ? 'text-slate-300' : 'text-gray-600'}`}>
                                                {change.description}
                                            </p>
                                        )}
                                    </div>
                                    {!change.isRead && (
                                        <button
                                            onClick={() => handleMarkAsRead(change.id)}
                                            className={`ml-2 px-2 py-1 text-xs rounded transition ${
                                                isDark
                                                    ? 'bg-slate-600 text-slate-200 hover:bg-slate-500'
                                                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                            }`}
                                            title="Mark as read"
                                        >
                                            <i className="fas fa-check"></i>
                                        </button>
                                    )}
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <div className={`flex items-center gap-3 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                                        {change.publishedAt && (
                                            <span>
                                                <i className="fas fa-calendar mr-1"></i>
                                                {new Date(change.publishedAt).toLocaleDateString('en-ZA', {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    year: 'numeric'
                                                })}
                                            </span>
                                        )}
                                        <span>
                                            <i className="fas fa-clock mr-1"></i>
                                            {new Date(change.createdAt).toLocaleDateString('en-ZA', {
                                                month: 'short',
                                                day: 'numeric'
                                            })}
                                        </span>
                                    </div>
                                    {change.url && (
                                        <a
                                            href={change.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={`font-medium transition ${
                                                isDark
                                                    ? 'text-blue-400 hover:text-blue-300'
                                                    : 'text-blue-600 hover:text-blue-700'
                                            }`}
                                        >
                                            View on SARS <i className="fas fa-external-link-alt ml-1"></i>
                                        </a>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-12">
                        <i className={`fas fa-search text-4xl mb-3 ${isDark ? 'text-slate-600' : 'text-gray-300'}`}></i>
                        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                            No changes found. Click "Check Now" to monitor SARS website.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

// Make available globally
window.SarsMonitoring = SarsMonitoring;

// Dispatch event to notify other components
try {
    window.dispatchEvent(new CustomEvent('componentLoaded', { 
        detail: { component: 'SarsMonitoring' } 
    }));
    console.log('✅ SarsMonitoring component registered and event dispatched');
} catch (error) {
    console.warn('⚠️ Failed to dispatch componentLoaded event:', error);
}

