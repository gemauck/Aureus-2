// My Feedback / My Queries – user sees only their own feedback and replies (read-only)
const { useState, useEffect } = React;

const MyFeedbackViewer = () => {
    const [feedback, setFeedback] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState({ status: 'open', search: '' });
    const { isDark } = window.useTheme();
    const { user } = window.useAuth();

    useEffect(() => {
        if (user?.id || user?.sub) loadFeedback();
    }, [user?.id, user?.sub]);

    const loadFeedback = async () => {
        setLoading(true);
        try {
            const response = await window.api.getFeedback({
                mine: true,
                includeUser: true,
                includeReplies: true
            });
            if (response?.platform || (response?.status === 'ok' && response?.timestamp)) {
                setFeedback([]);
                return;
            }
            const data = response?.data || response || [];
            setFeedback(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to load my feedback:', err);
            setFeedback([]);
        } finally {
            setLoading(false);
        }
    };

    const filtered = feedback.filter((item) => {
        const status = item.status ?? 'open';
        if (filter.status === 'open' && status !== 'open') return false;
        if (filter.status === 'done' && status !== 'done') return false;
        if (filter.search && !item.message?.toLowerCase().includes(filter.search.toLowerCase()) &&
            !item.section?.toLowerCase().includes(filter.search.toLowerCase())) return false;
        return true;
    });

    const formatDate = (d) => d ? new Date(d).toLocaleString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    const getInitials = (name) => !name ? 'U' : name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

    if (!user) {
        return (
            <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                <i className="fas fa-lock text-3xl mb-3"></i>
                <p>Please sign in to view your feedback and queries.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-4`}>
                <h2 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                    My queries & feedback
                </h2>
                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
                    View your submitted feedback, how it was classified, and any replies from the team.
                </p>
                <div className="flex flex-wrap gap-3 mt-3">
                    <select
                        value={filter.status}
                        onChange={(e) => setFilter({ ...filter, status: e.target.value })}
                        className={`px-3 py-2 text-sm border rounded-lg ${isDark ? 'bg-gray-700 border-gray-600 text-gray-200' : 'border-gray-300'}`}
                    >
                        <option value="open">Open</option>
                        <option value="done">Done</option>
                        <option value="all">All</option>
                    </select>
                    <input
                        type="text"
                        placeholder="Search..."
                        value={filter.search}
                        onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                        className={`px-3 py-2 text-sm border rounded-lg flex-1 min-w-[160px] ${isDark ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-400' : 'border-gray-300'}`}
                    />
                    <button
                        type="button"
                        onClick={loadFeedback}
                        className={`px-3 py-2 rounded-lg text-sm font-medium ${isDark ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                        <i className="fas fa-sync-alt mr-1.5"></i> Refresh
                    </button>
                </div>
            </div>

            {loading ? (
                <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    <i className="fas fa-spinner fa-spin text-2xl mb-2"></i>
                    <p>Loading your feedback...</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    <i className="fas fa-inbox text-3xl mb-3 opacity-50"></i>
                    <p>No feedback found.</p>
                    <p className="text-sm mt-1">Use the feedback widget on any page to submit a query or report an issue.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map((item) => (
                        <div
                            key={item.id}
                            className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-4`}
                        >
                            <div className="flex items-start gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0 ${isDark ? 'bg-primary-600 text-white' : 'bg-primary-100 text-primary-700'}`}>
                                    {item.user ? getInitials(item.user.name) : 'U'}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                            (item.type || 'feedback') === 'bug' ? (isDark ? 'bg-red-900/40 text-red-300' : 'bg-red-100 text-red-800') :
                                            (item.type || 'feedback') === 'development_request' ? (isDark ? 'bg-purple-900/40 text-purple-300' : 'bg-purple-100 text-purple-800') :
                                            isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-800'
                                        }`}>
                                            {item.type === 'development_request' ? 'Development Request' : (item.type || 'feedback')}
                                        </span>
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                            (item.status ?? 'open') === 'done' ? (isDark ? 'bg-green-900/40 text-green-300' : 'bg-green-100 text-green-800') :
                                            isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-800'
                                        }`}>
                                            {item.status ?? 'open'}
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
                                        <div><strong>Page:</strong> <code className={isDark ? 'bg-gray-700 px-1 rounded' : 'bg-gray-100 px-1 rounded'}>{item.pageUrl}</code></div>
                                    </div>
                                    {item.replies && item.replies.length > 0 && (
                                        <div className={`mt-3 pt-3 border-t ${isDark ? 'border-gray-700' : 'border-gray-100'} space-y-2`}>
                                            <div className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Replies from the team</div>
                                            {item.replies.map((reply) => (
                                                <div key={reply.id} className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg p-3`}>
                                                    <div className="flex items-start gap-2">
                                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${isDark ? 'bg-primary-500 text-white' : 'bg-primary-100 text-primary-700'}`}>
                                                            {reply.user ? getInitials(reply.user.name || reply.user.email) : 'AD'}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className={`text-sm font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                                    {reply.user?.name || reply.user?.email || 'Team'}
                                                                </span>
                                                                <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                                    {formatDate(reply.createdAt)}
                                                                </span>
                                                            </div>
                                                            <p className={`text-sm mt-1 ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{reply.message}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

window.MyFeedbackViewer = MyFeedbackViewer;
