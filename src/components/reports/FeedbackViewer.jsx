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
    const [replyInputs, setReplyInputs] = useState({});
    const [submittingReplyId, setSubmittingReplyId] = useState(null);
    const [replyErrors, setReplyErrors] = useState({});
    const { isDark } = window.useTheme();
    const { user } = window.useAuth();

    // Check if user is admin
    const isAdmin = user?.role?.toLowerCase() === 'admin';

    useEffect(() => {
        if (isAdmin) {
            loadFeedback();
        }
    }, [isAdmin]);

    // Also reload when component becomes visible (in case feedback was submitted)
    useEffect(() => {
        if (isAdmin) {
            // Small delay to ensure tab is fully visible
            const timer = setTimeout(() => {
                loadFeedback();
            }, 100);
            return () => clearTimeout(timer);
        }
    }, []);

    const loadFeedback = async () => {
        setLoading(true);
        try {
            console.log('📥 Loading feedback from API...');
            const response = await window.api.getFeedback({
                includeUser: true,
                includeReplies: true
            });
            console.log('📥 Feedback API response:', response);
            
            // Check if we got a health check response by mistake
            if (response?.platform || response?.status === 'ok' && response?.timestamp) {
                console.error('❌ Got health check response instead of feedback!');
                console.error('   Response:', response);
                console.error('   This means /api/feedback is routing to wrong endpoint');
                setFeedback([]);
                return;
            }
            
            // API returns { data: [...] }, so extract the data array
            const feedbackData = response?.data || response || [];
            const feedbackArray = Array.isArray(feedbackData) ? feedbackData : [];
            
            console.log('📥 Extracted feedback array:', feedbackArray.length, 'items');
            
            if (feedbackArray.length > 0) {
                console.log('📥 First feedback item:', feedbackArray[0]);
            }
            
            setFeedback(feedbackArray);
        } catch (error) {
            console.error('❌ Failed to load feedback:', error);
            console.error('❌ Error details:', error.message, error.stack);
            setFeedback([]);
        } finally {
            setLoading(false);
        }
    };

    const handleReplyChange = (feedbackId, value) => {
        setReplyInputs(prev => ({
            ...prev,
            [feedbackId]: value
        }));
    };

    const handleReplySubmit = async (feedbackId) => {
        const message = (replyInputs[feedbackId] || '').trim();
        if (!message || submittingReplyId === feedbackId) {
            return;
        }

        setReplyErrors(prev => ({
            ...prev,
            [feedbackId]: null
        }));
        setSubmittingReplyId(feedbackId);

        try {
            await window.api.replyToFeedback(feedbackId, { message });
            setReplyInputs(prev => ({
                ...prev,
                [feedbackId]: ''
            }));
            await loadFeedback();
        } catch (error) {
            console.error('❌ Failed to submit reply:', error);
            setReplyErrors(prev => ({
                ...prev,
                [feedbackId]: error?.message || 'Failed to submit reply. Please try again.'
            }));
        } finally {
            setSubmittingReplyId(null);
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
                                    <div className={`mt-3 pt-3 border-t ${isDark ? 'border-gray-700' : 'border-gray-100'} space-y-3`}>
                                        <div className="space-y-2">
                                            {(item.replies && item.replies.length > 0) ? (
                                                item.replies.map((reply) => (
                                                    <div
                                                        key={reply.id}
                                                        className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg p-3`}
                                                    >
                                                        <div className="flex items-start gap-2">
                                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                                                                isDark ? 'bg-primary-500 text-white' : 'bg-primary-100 text-primary-700'
                                                            }`}>
                                                                {reply.user ? getInitials(reply.user.name || reply.user.email || 'Admin') : 'AD'}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <span className={`text-sm font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                                        {reply.user?.name || reply.user?.email || 'Admin'}
                                                                    </span>
                                                                    <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                                        {formatDate(reply.createdAt)}
                                                                    </span>
                                                                </div>
                                                                <p className={`text-sm mt-1 ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{reply.message}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <p className={`text-xs italic ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                                                    No replies yet.
                                                </p>
                                            )}
                                        </div>
                                        <div>
                                            <textarea
                                                value={replyInputs[item.id] || ''}
                                                onChange={(e) => handleReplyChange(item.id, e.target.value)}
                                                placeholder="Write a reply..."
                                                rows={2}
                                                className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                                                    isDark
                                                        ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400'
                                                        : 'border-gray-300'
                                                }`}
                                            />
                                            <div className="flex items-center justify-between mt-2">
                                                {replyErrors[item.id] && (
                                                    <span className="text-xs text-red-500">{replyErrors[item.id]}</span>
                                                )}
                                                <button
                                                    onClick={() => handleReplySubmit(item.id)}
                                                    disabled={(replyInputs[item.id] || '').trim().length === 0 || submittingReplyId === item.id}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                                        submittingReplyId === item.id
                                                            ? 'opacity-70 cursor-not-allowed'
                                                            : ''
                                                    } ${
                                                        isDark
                                                            ? 'bg-primary-600 text-white hover:bg-primary-500 disabled:bg-primary-700'
                                                            : 'bg-primary-100 text-primary-700 hover:bg-primary-200 disabled:bg-primary-100'
                                                    }`}
                                                >
                                                    {submittingReplyId === item.id ? 'Sending...' : 'Reply'}
                                                </button>
                                            </div>
                                        </div>
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

