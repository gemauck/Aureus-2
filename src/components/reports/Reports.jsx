// Use React from window
const { useState, useEffect } = React;

const Reports = () => {
    // Get report components from window
    const AuditTrail = window.AuditTrail;
    const [feedbackViewerReady, setFeedbackViewerReady] = useState(!!window.FeedbackViewer);
    const [activeTab, setActiveTab] = useState('audit');
    const { isDark } = window.useTheme();
    const { user } = window.useAuth();

    const isAdmin = user?.role?.toLowerCase() === 'admin';

    // Wait for FeedbackViewer to load
    useEffect(() => {
        // Check if FeedbackViewer is already available
        if (window.FeedbackViewer) {
            setFeedbackViewerReady(true);
            return;
        }
        
        // Check periodically for FeedbackViewer if it's not loaded yet
        const checkInterval = setInterval(() => {
            if (window.FeedbackViewer) {
                setFeedbackViewerReady(true);
                clearInterval(checkInterval);
            }
        }, 200);
        
        // Stop checking after 10 seconds
        const timeout = setTimeout(() => {
            clearInterval(checkInterval);
            if (!window.FeedbackViewer) {
                console.warn('⚠️ FeedbackViewer component not loaded after 10 seconds');
            }
        }, 10000);
        
        return () => {
            clearInterval(checkInterval);
            clearTimeout(timeout);
        };
    }, []); // Only run once on mount

    // Also check when switching to feedback tab
    useEffect(() => {
        if (activeTab === 'feedback' && window.FeedbackViewer && !feedbackViewerReady) {
            setFeedbackViewerReady(true);
        }
    }, [activeTab, feedbackViewerReady]);

    const FeedbackViewer = window.FeedbackViewer;

    return (
        <div className="space-y-3">
            {/* Header */}
            <div>
                <h1 className={`text-xl sm:text-2xl font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Reports & Feedback</h1>
                <p className={`text-sm mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    System activity monitoring, audit logs, and user feedback
                </p>
            </div>

            {/* Tabs */}
            <div className={`border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                <nav className="flex space-x-4">
                    <button
                        onClick={() => setActiveTab('audit')}
                        className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                            activeTab === 'audit'
                                ? 'border-primary-500 text-primary-600'
                                : isDark
                                    ? 'border-transparent text-gray-400 hover:text-gray-300'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        Audit Trail
                    </button>
                    {isAdmin && (
                        <button
                            onClick={() => setActiveTab('feedback')}
                            className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                                activeTab === 'feedback'
                                    ? 'border-primary-500 text-primary-600'
                                    : isDark
                                        ? 'border-transparent text-gray-400 hover:text-gray-300'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            User Feedback
                            <span className={`ml-2 px-1.5 py-0.5 rounded-full text-xs ${
                                isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'
                            }`}>
                                Admin Only
                            </span>
                        </button>
                    )}
                </nav>
            </div>

            {/* Content */}
            <div>
                {activeTab === 'audit' && (
                    <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4`}>
                        {AuditTrail ? <AuditTrail /> : <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Loading...</div>}
                    </div>
                )}
                {activeTab === 'feedback' && isAdmin && (
                    <div>
                        {FeedbackViewer && feedbackViewerReady ? (
                            <FeedbackViewer />
                        ) : (
                            <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                <i className="fas fa-spinner fa-spin text-2xl mb-2"></i>
                                <p>Loading feedback viewer...</p>
                                {!feedbackViewerReady && (
                                    <p className="text-xs mt-2 opacity-75">If this persists, please refresh the page</p>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// Make available globally
window.Reports = Reports;
