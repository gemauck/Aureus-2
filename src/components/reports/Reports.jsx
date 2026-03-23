// Use React from window
const { useState, useEffect } = React;

const Reports = () => {
    // Get report components from window
    const AuditTrail = window.AuditTrail;
    const { isDark } = window.useTheme();
    const { user } = window.useAuth();

    const isAdmin = typeof window.isAdminRole === 'function' && window.isAdminRole(user?.role);
    const canViewAuditTrail = typeof window.isSuperAdminRole === 'function' && window.isSuperAdminRole(user?.role);
    const canViewFeedback = isAdmin || canViewAuditTrail; // Admin-equivalent and super-admin tier can see User Feedback

    const [feedbackViewerReady, setFeedbackViewerReady] = useState(!!window.FeedbackViewer);
    const [myFeedbackViewerReady, setMyFeedbackViewerReady] = useState(!!window.MyFeedbackViewer);
    const [activeTab, setActiveTab] = useState(
      canViewAuditTrail ? 'audit' : (canViewFeedback ? 'feedback' : 'my-queries')
    );

    // When user loads, set correct default tab
    useEffect(() => {
        if (canViewAuditTrail && activeTab === 'restricted') {
            setActiveTab('audit');
        } else if (canViewFeedback && !canViewAuditTrail && activeTab === 'restricted') {
            setActiveTab('feedback');
        } else if (!canViewFeedback && activeTab === 'restricted') {
            setActiveTab('my-queries');
        }
    }, [canViewAuditTrail, canViewFeedback]);

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

    // Also check when switching to feedback / my-queries tab
    useEffect(() => {
        if (activeTab === 'feedback' && window.FeedbackViewer && !feedbackViewerReady) {
            setFeedbackViewerReady(true);
        }
        if (activeTab === 'my-queries' && window.MyFeedbackViewer && !myFeedbackViewerReady) {
            setMyFeedbackViewerReady(true);
        }
    }, [activeTab, feedbackViewerReady, myFeedbackViewerReady]);

    const FeedbackViewer = window.FeedbackViewer;
    const MyFeedbackViewer = window.MyFeedbackViewer;

    return (
        <div className="erp-module-root space-y-3 min-w-0">
            {/* Header */}
            <div>
                <h1 className={`text-xl sm:text-2xl font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Reports & Feedback</h1>
                <p className={`text-sm mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    System activity monitoring, audit logs, and user feedback
                </p>
            </div>

            {/* Tabs */}
            <div className={`border-b ${isDark ? 'border-gray-700' : 'border-gray-200'} overflow-x-auto`}>
                <nav className="flex flex-nowrap gap-4 min-w-0 pb-px">
                    {canViewAuditTrail && (
                        <button
                            onClick={() => setActiveTab('audit')}
                            className={`shrink-0 py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                                activeTab === 'audit'
                                    ? 'border-primary-500 text-primary-600'
                                    : isDark
                                        ? 'border-transparent text-gray-400 hover:text-gray-300'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            Audit Trail
                        </button>
                    )}
                    <button
                        onClick={() => setActiveTab('my-queries')}
                        className={`shrink-0 py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                            activeTab === 'my-queries'
                                ? 'border-primary-500 text-primary-600'
                                : isDark
                                    ? 'border-transparent text-gray-400 hover:text-gray-300'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        My queries
                    </button>
                    {canViewFeedback && (
                        <button
                            onClick={() => setActiveTab('feedback')}
                            className={`shrink-0 py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
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
                                Admin
                            </span>
                        </button>
                    )}
                </nav>
            </div>

            {/* Content */}
            <div>
                {activeTab === 'audit' && canViewAuditTrail && (
                    <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-4`}>
                        {AuditTrail ? <AuditTrail /> : <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Loading...</div>}
                    </div>
                )}
                {activeTab === 'my-queries' && (
                    <div>
                        {MyFeedbackViewer && myFeedbackViewerReady ? (
                            <MyFeedbackViewer />
                        ) : (
                            <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                <i className="fas fa-spinner fa-spin text-2xl mb-2"></i>
                                <p>Loading...</p>
                            </div>
                        )}
                    </div>
                )}
                {activeTab === 'restricted' && !canViewAuditTrail && (
                    <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-8 text-center`}>
                        <i className="fas fa-lock text-4xl text-gray-400 mb-4"></i>
                        <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            Access to the detailed audit trail is restricted to Superadmins only.
                        </p>
                        <p className={`text-xs mt-2 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                            All users&apos; interactions are tracked; only users with the Superadmin role can view this report.
                        </p>
                    </div>
                )}
                {activeTab === 'feedback' && canViewFeedback && (
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
