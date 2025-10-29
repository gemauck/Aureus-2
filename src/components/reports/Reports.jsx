// Use React from window
const { useState } = React;

const Reports = () => {
    // Get report components from window
    const AuditTrail = window.AuditTrail;
    const FeedbackViewer = window.FeedbackViewer;
    const [activeTab, setActiveTab] = useState('audit');
    const { isDark } = window.useTheme();
    const { user } = window.useAuth();

    const isAdmin = user?.role?.toLowerCase() === 'admin';

    return (
        <div className="space-y-3">
            {/* Header */}
            <div>
                <h1 className={`text-lg font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Reports & Feedback</h1>
                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'} mt-0.5`}>
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
                            {FeedbackViewer && (
                                <span className={`ml-2 px-1.5 py-0.5 rounded-full text-xs ${
                                    isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'
                                }`}>
                                    Admin Only
                                </span>
                            )}
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
                        {FeedbackViewer ? <FeedbackViewer /> : <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Loading feedback viewer...</div>}
                    </div>
                )}
            </div>
        </div>
    );
};

// Make available globally
window.Reports = Reports;
