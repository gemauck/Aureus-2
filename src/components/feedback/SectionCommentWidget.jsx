// Section-specific comment widget that can be embedded in any section
const { useState, useEffect, useRef } = React;

const SectionCommentWidget = ({ sectionId, sectionName, className = '' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [comments, setComments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [message, setMessage] = useState('');
    const { user } = window.useAuth();
    const { isDark } = window.useTheme();
    const commentsContainerRef = useRef(null);

    // Get current page URL and section identifier
    const pageUrl = window.location.pathname;
    const section = sectionName || sectionId || 'general';

    // Load comments for this section
    useEffect(() => {
        if (isOpen) {
            loadComments();
        }
    }, [isOpen, pageUrl, section]);
    
    // Auto-scroll to last comment when widget opens
    useEffect(() => {
        if (isOpen && commentsContainerRef.current && comments.length > 0) {
            // Small delay to ensure DOM is ready
            setTimeout(() => {
                if (commentsContainerRef.current) {
                    commentsContainerRef.current.scrollTop = commentsContainerRef.current.scrollHeight;
                }
            }, 100);
        }
    }, [isOpen, comments.length]); // Re-scroll when widget opens or comments update

    const normalizeFeedbackResponse = (response) => {
        if (!response) return [];
        if (Array.isArray(response)) return response;
        if (Array.isArray(response?.data)) return response.data;
        if (Array.isArray(response?.data?.data)) return response.data.data;
        return [];
    };

    const loadComments = async () => {
        setLoading(true);
        try {
            const response = await window.api.getFeedback({
                pageUrl: pageUrl,
                section: section,
                includeUser: true
            });
            const feedbackItems = normalizeFeedbackResponse(response);
            setComments(feedbackItems);
        } catch (error) {
            console.error('Failed to load comments:', error);
            setComments([]);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!message.trim()) {
            alert('Please enter a comment');
            return;
        }

        setSubmitting(true);
        try {
            await window.api.submitFeedback({
                message: message.trim(),
                pageUrl: pageUrl,
                section: section,
                type: 'feedback',
                severity: 'low',
                meta: {
                    userAgent: navigator.userAgent,
                    userName: user?.name || null,
                    userEmail: user?.email || null
                }
            });

            setMessage('');
            setShowForm(false);
            await loadComments(); // Refresh comments
        } catch (error) {
            console.error('Failed to submit comment:', error);
            alert('Could not submit comment. Please try again.');
        } finally {
            setSubmitting(false);
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
        return date.toLocaleDateString();
    };

    const getInitials = (name) => {
        if (!name) return 'U';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    if (!isOpen) {
        return (
            <div className={`inline-flex items-center gap-2 ${className}`}>
                <button
                    onClick={() => setIsOpen(true)}
                    className={`text-xs flex items-center gap-1 px-2 py-1 rounded transition-colors ${
                        isDark 
                            ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' 
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                    }`}
                    title="View comments and add feedback"
                >
                    <i className="fas fa-comment text-[10px]"></i>
                    <span>Comments</span>
                    {comments.length > 0 && (
                        <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                            isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'
                        }`}>
                            {comments.length}
                        </span>
                    )}
                </button>
            </div>
        );
    }

    return (
        <div className={`fixed inset-0 z-50 flex items-center justify-center ${isDark ? 'bg-black bg-opacity-50' : 'bg-black bg-opacity-30'}`} onClick={() => setIsOpen(false)}>
            <div 
                className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className={`px-4 py-3 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'} flex items-center justify-between`}>
                    <div>
                        <h3 className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                            Comments: {sectionName || section}
                        </h3>
                        <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-0.5`}>
                            {pageUrl}
                        </p>
                    </div>
                    <button
                        onClick={() => setIsOpen(false)}
                        className={`${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'} p-1 rounded`}
                    >
                        <i className="fas fa-times text-sm"></i>
                    </button>
                </div>

                {/* Comments List */}
                <div 
                    ref={commentsContainerRef} 
                    className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0"
                    style={{ maxHeight: 'calc(80vh - 200px)' }}
                >
                    {loading ? (
                        <div className={`text-center py-8 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            <i className="fas fa-spinner fa-spin text-lg mb-2"></i>
                            <p className="text-xs">Loading comments...</p>
                        </div>
                    ) : comments.length === 0 ? (
                        <div className={`text-center py-8 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            <i className="fas fa-comments text-2xl mb-2 opacity-50"></i>
                            <p className="text-xs">No comments yet. Be the first to comment!</p>
                        </div>
                    ) : (
                        comments.map((comment) => (
                            <div 
                                key={comment.id}
                                className={`p-3 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-50'} border ${isDark ? 'border-gray-600' : 'border-gray-200'}`}
                            >
                                <div className="flex items-start gap-2">
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${
                                        isDark ? 'bg-primary-600 text-white' : 'bg-primary-100 text-primary-700'
                                    }`}>
                                        {comment.user ? getInitials(comment.user.name) : 'U'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`text-xs font-medium ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                                                {comment.user?.name || 'Anonymous'}
                                            </span>
                                            <span className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                                {formatDate(comment.createdAt)}
                                            </span>
                                        </div>
                                        <p className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-700'} whitespace-pre-wrap break-words`}>
                                            {comment.message}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Add Comment Form */}
                <div className={`px-4 py-3 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'} ${isDark ? 'bg-gray-750' : 'bg-gray-50'}`}>
                    {!showForm ? (
                        <button
                            onClick={() => setShowForm(true)}
                            className={`w-full py-2 px-3 rounded-lg text-xs font-medium transition-colors ${
                                isDark
                                    ? 'bg-gray-700 text-gray-200 hover:bg-gray-600 border border-gray-600'
                                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                            }`}
                        >
                            <i className="fas fa-plus mr-1.5"></i>
                            Add a comment
                        </button>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-2">
                            <textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder="Write your comment..."
                                rows={3}
                                className={`w-full px-3 py-2 text-xs rounded-lg border resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                                    isDark
                                        ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-400'
                                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                                }`}
                                disabled={submitting}
                            />
                            <div className="flex items-center gap-2">
                                <button
                                    type="submit"
                                    disabled={submitting || !message.trim()}
                                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors ${
                                        submitting || !message.trim()
                                            ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                                            : 'bg-primary-600 text-white hover:bg-primary-700'
                                    }`}
                                >
                                    {submitting ? (
                                        <>
                                            <i className="fas fa-spinner fa-spin mr-1.5"></i>
                                            Submitting...
                                        </>
                                    ) : (
                                        <>
                                            <i className="fas fa-paper-plane mr-1.5"></i>
                                            Post Comment
                                        </>
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowForm(false);
                                        setMessage('');
                                    }}
                                    className={`py-2 px-3 rounded-lg text-xs font-medium transition-colors ${
                                        isDark
                                            ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                                    }`}
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

window.SectionCommentWidget = SectionCommentWidget;

