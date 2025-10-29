// Admin Feedback Viewer Component
const { useState, useEffect } = React;

const FeedbackViewer = () => {
    const [feedback, setFeedback] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState({
        type: 'all',
        severity: 'all',
        search: ''
    });
    const { isDark } = window.useTheme();
    const { user } = window.useAuth();

    // Check if user is admin
    const isAdmin = user?.role?.toLowerCase() === 'admin';

    useEffect(() => {
        if (isAdmin) {
            loadFeedback();
        }
    }, [isAdmin]);

    const loadFeedback = async () => {
        setLoading(true);
        try {
            const data = await window.api.getFeedback({
                includeUser: true
            });
            setFeedback(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Failed to load feedback:', error);
            setFeedback([]);
        } finally {
            setLoading(false);
        }
    };

    const filteredFeedback = feedback.filter(item => {
        if (filter.type !== 'all' && item.type !== filter.type) return false;
        if (filter.severity !== 'all' && item.severity !== filter.severity) return false;
        if (filter.search && !item.message.toLowerCase().includes(filter.search.toLowerCase()) &&
            !item.section?.toLowerCase().includes(filter.search.toLowerCase()) &&
            !item.pageUrl?.toLowerCase().includes(filter.search.toLowerCase())) {
            return false;
        }
        return true;
    });

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleString('en-ZA', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getInitials = (name) => {
        if (!name) return 'U';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    if (!isAdmin) {
        return (
            <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                <i className="fas fa-lock text-3xl mb-3"></i>
                <p>Admin access required to view feedback</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header with Stats */}
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-4`}>
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                            User Feedback & Comments
                        </h2>
                        <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
                            Review and manage feedback from users
                        </p>
                    </div>
                    <button
                        onClick={loadFeedback}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            isDark
                                ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                        <i className="fas fa-sync-alt mr-1.5"></i>
                        Refresh
                    </button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3">
                    <div className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} rounded p-2`}>
                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Total</div>
                        <div className={`text-lg font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                            {feedback.length}
                        </div>
                    </div>
                    <div className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} rounded p-2`}>
                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Bugs</div>
                        <div className={`text-lg font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                            {feedback.filter(f => f.type === 'bug').length}
                        </div>
                    </div>
                    <div className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} rounded p-2`}>
                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>High Priority</div>
                        <div className={`text-lg font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                            {feedback.filter(f => f.severity === 'high').length}
                        </div>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-4`}>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="md:col-span-2">
                        <input
                            type="text"
                            placeholder="Search feedback..."
                            value={filter.search}
                            onChange={(e) => setFilter({...filter, search: e.target.value})}
                            className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                                isDark
                                    ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-400'
                                    : 'border-gray-300'
                            }`}
                        />
                    </div>
                    <select
                        value={filter.type}
                        onChange={(e) => setFilter({...filter, type: e.target.value})}
                        className={`px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                            isDark
                                ? 'bg-gray-700 border-gray-600 text-gray-200'
                                : 'border-gray-300'
                        }`}
                    >
                        <option value="all">All Types</option>
                        <option value="feedback">Feedback</option>
                        <option value="bug">Bug</option>
                        <option value="idea">Idea</option>
                    </select>
                    <select
                        value={filter.severity}
                        onChange={(e) => setFilter({...filter, severity: e.target.value})}
                        className={`px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                            isDark
                                ? 'bg-gray-700 border-gray-600 text-gray-200'
                                : 'border-gray-300'
                        }`}
                    >
                        <option value="all">All Severities</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                    </select>
                </div>
            </div>

            {/* Feedback List */}
            <div className="space-y-3">
                {loading ? (
                    <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        <i className="fas fa-spinner fa-spin text-2xl mb-2"></i>
                        <p>Loading feedback...</p>
                    </div>
                ) : filteredFeedback.length === 0 ? (
                    <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        <i className="fas fa-comments text-3xl mb-3 opacity-50"></i>
                        <p>No feedback found</p>
                    </div>
                ) : (
                    filteredFeedback.map((item) => (
                        <div
                            key={item.id}
                            className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-4`}
                        >
                            <div className="flex items-start gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0 ${
                                    isDark ? 'bg-primary-600 text-white' : 'bg-primary-100 text-primary-700'
                                }`}>
                                    {item.user ? getInitials(item.user.name) : 'U'}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                                        <span className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                                            {item.user?.name || 'Anonymous'}
                                        </span>
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                            item.type === 'bug' ? 'bg-red-100 text-red-800' :
                                            item.type === 'idea' ? 'bg-blue-100 text-blue-800' :
                                            'bg-green-100 text-green-800'
                                        }`}>
                                            {item.type}
                                        </span>
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                            item.severity === 'high' ? 'bg-red-100 text-red-800' :
                                            item.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                            'bg-green-100 text-green-800'
                                        }`}>
                                            {item.severity}
                                        </span>
                                        <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                            {formatDate(item.createdAt)}
                                        </span>
                                    </div>
                                    <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'} whitespace-pre-wrap mb-2`}>
                                        {item.message}
                                    </p>
                                    <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                                        <div><strong>Section:</strong> {item.section || 'general'}</div>
                                        <div><strong>Page:</strong> <code className="bg-gray-100 px-1 rounded">{item.pageUrl}</code></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

window.FeedbackViewer = FeedbackViewer;

