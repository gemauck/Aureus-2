// Lightweight feedback widget with comment viewing
const { useState, useEffect, useRef } = React;

const FeedbackWidget = () => {
    const [open, setOpen] = useState(false);
    const [message, setMessage] = useState('');
    const [section, setSection] = useState('');
    const [type, setType] = useState('feedback');
    const [severity, setSeverity] = useState('medium');
    const [submitting, setSubmitting] = useState(false);
    const [comments, setComments] = useState([]);
    const [loadingComments, setLoadingComments] = useState(false);
    const { user } = window.useAuth();
    const { isDark } = window.useTheme();
    const recentCommentsContainerRef = useRef(null);

    // Auto-detect current section/page
    const detectCurrentSection = () => {
        // Get page from URL or pathname
        const path = window.location.pathname;
        const urlParams = new URLSearchParams(window.location.search);
        
        // Page name mapping
        const pageNames = {
            '/': 'Dashboard',
            '/dashboard': 'Dashboard',
            '/clients': 'Clients and Leads',
            '/projects': 'Projects',
            '/teams': 'Teams',
            '/users': 'Users',
            '/manufacturing': 'Manufacturing',
            '/tools': 'Tools',
            '/reports': 'Reports',
            '/settings': 'Settings',
            '/account': 'Account',
            '/time': 'Time Tracking'
        };

        // Try to get from window.currentPage (exposed by MainLayout)
        let pageName = null;
        if (window.currentPage) {
            const pageId = window.currentPage;
            // Map page IDs to friendly names
            const pageIdMap = {
                'dashboard': 'Dashboard',
                'clients': 'Clients and Leads',
                'projects': 'Projects',
                'teams': 'Teams',
                'users': 'Users',
                'manufacturing': 'Manufacturing',
                'tools': 'Tools',
                'reports': 'Reports',
                'settings': 'Settings',
                'account': 'Account',
                'time': 'Time Tracking',
                'documents': 'Documents'
            };
            pageName = pageIdMap[pageId] || pageId.charAt(0).toUpperCase() + pageId.slice(1);
        }

        // If not available, detect from URL
        if (!pageName) {
            pageName = pageNames[path] || path.split('/').filter(Boolean).pop()?.charAt(0).toUpperCase() + path.split('/').filter(Boolean).pop()?.slice(1) || 'General';
        }

        // Check for sub-sections (query params, hash, or specific elements)
        const tab = urlParams.get('tab');
        const view = urlParams.get('view');
        const hash = window.location.hash;
        
        // Detect active tab/view from URL params
        if (tab) {
            const tabLabel = tab.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            return `${pageName} > ${tabLabel}`;
        }
        if (view) {
            const viewLabel = view.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            return `${pageName} > ${viewLabel}`;
        }
        
        // Detect from hash (e.g., #pipeline, #list)
        if (hash && hash.length > 1) {
            const hashSection = hash.substring(1).split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            if (hashSection && hashSection !== pageName) {
                return `${pageName} > ${hashSection}`;
            }
        }

        // Check for common UI elements that indicate sections
        // This is a fallback - the SectionCommentWidget will provide better context
        const pipelineElement = document.querySelector('[data-section="pipeline"], .pipeline-view, #pipeline');
        const listViewElement = document.querySelector('[data-section="list"], .list-view, [data-view="list"]');
        
        if (pipelineElement && (pageName.includes('Clients') || pageName.includes('Leads'))) {
            return `${pageName} > Pipeline`;
        }
        if (listViewElement && !pipelineElement) {
            return `${pageName} > List View`;
        }

        return pageName;
    };

    // Auto-populate section when widget opens or page changes
    useEffect(() => {
        if (open) {
            const autoDetected = detectCurrentSection();
            // Only auto-populate if section is empty or it's a generic value
            if (!section || section === 'general' || section === '') {
                setSection(autoDetected);
            }
            // Always update if the detected section is different (user can still override)
            else if (autoDetected !== section && !section.includes('>')) {
                // Only update if current section doesn't look manually customized
                setSection(autoDetected);
            }
        }
    }, [open, window.currentPage, window.location.pathname]);

    // Load recent comments when widget opens
    useEffect(() => {
        if (open) {
            loadRecentComments();
        }
    }, [open]);
    
    // Auto-scroll to last comment when widget opens
    useEffect(() => {
        if (open && recentCommentsContainerRef.current && comments.length > 0) {
            // Small delay to ensure DOM is ready
            setTimeout(() => {
                if (recentCommentsContainerRef.current) {
                    recentCommentsContainerRef.current.scrollTop = recentCommentsContainerRef.current.scrollHeight;
                }
            }, 100);
        }
    }, [open, comments.length]); // Re-scroll when widget opens or comments update

    const loadRecentComments = async () => {
        setLoadingComments(true);
        try {
            const data = await window.api.getFeedback({
                pageUrl: window.location.pathname,
                includeUser: true
            });
            // Get unique sections and their latest comments
            const sectionComments = {};
            (Array.isArray(data) ? data : []).forEach(comment => {
                const key = comment.section || 'general';
                if (!sectionComments[key] || new Date(comment.createdAt) > new Date(sectionComments[key].createdAt)) {
                    sectionComments[key] = comment;
                }
            });
            setComments(Object.values(sectionComments).slice(0, 5)); // Show up to 5 recent comments
        } catch (error) {
            console.error('Failed to load comments:', error);
            setComments([]);
        } finally {
            setLoadingComments(false);
        }
    };

    const submit = async () => {
        if (!message.trim()) {
            alert('Please enter your feedback');
            return;
        }
        setSubmitting(true);
        try {
            await window.api.submitFeedback({
                message: message.trim(),
                pageUrl: window.location.pathname,
                section: section.trim() || 'general',
                type,
                severity,
                meta: {
                    userAgent: navigator.userAgent,
                    viewport: `${window.innerWidth}x${window.innerHeight}`,
                    screen: `${window.screen.width}x${window.screen.height}`,
                    userName: user?.name || null,
                    userEmail: user?.email || null
                }
            });
            setMessage('');
            setSection('');
            setOpen(false);
            await loadRecentComments(); // Refresh comments
            alert('Thanks! Your feedback was submitted.');
        } catch (e) {
            console.error(e);
            alert('Could not submit feedback. Please try again later.');
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

    // Detect mobile
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
    
    return (
        <div className={`fixed ${isMobile ? 'left-4 right-4' : 'right-4'} bottom-4 z-50`}>
            {!open ? (
                <button
                    onClick={() => setOpen(true)}
                    className="bg-primary-600 text-white px-3 py-2 rounded-full shadow-lg text-xs font-medium hover:bg-primary-700"
                    title="Send feedback"
                >
                    <i className="fas fa-comment-dots mr-1"></i>
                    Feedback
                </button>
            ) : (
                <div className={`${isMobile ? 'w-full max-w-[calc(100vw-2rem)]' : 'w-80'} ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col`}>
                    <div className={`px-3 py-2 border-b ${isDark ? 'border-gray-700 bg-gray-750' : 'border-gray-200 bg-gray-50'} flex items-center justify-between`}>
                        <div className={`text-xs font-semibold ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>Send Feedback</div>
                        <button className={`${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`} onClick={() => setOpen(false)}>
                            <i className="fas fa-times text-xs"></i>
                        </button>
                    </div>
                    
                    {/* Recent Comments Section */}
                    {comments.length > 0 && (
                        <div className={`px-3 py-2 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'} ${isDark ? 'bg-gray-750' : 'bg-gray-50'}`}>
                            <div className={`text-[10px] font-semibold uppercase ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-1`}>
                                Recent Comments
                            </div>
                            <div ref={recentCommentsContainerRef} className="space-y-1.5 max-h-32 overflow-y-auto">
                                {loadingComments ? (
                                    <div className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                        <i className="fas fa-spinner fa-spin mr-1"></i>Loading...
                                    </div>
                                ) : (
                                    comments.map((comment) => (
                                        <div key={comment.id} className={`text-[10px] ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                            <span className="font-medium">{comment.user?.name || 'Anonymous'}</span>
                                            {' '}on{' '}
                                            <span className="font-medium">{comment.section || 'general'}</span>
                                            {' '}<span className={isDark ? 'text-gray-500' : 'text-gray-400'}>({formatDate(comment.createdAt)})</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {/* Form Section */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                        <div>
                            <label className={`block text-[10px] ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-1`}>
                                Section {section && <span className="text-green-600 dark:text-green-400">(auto-detected)</span>}
                            </label>
                            <input
                                value={section}
                                onChange={(e) => setSection(e.target.value)}
                                placeholder="e.g., Clients > Contacts"
                                className={`w-full border rounded px-2 py-1 text-xs focus:ring-1 focus:ring-primary-500 focus:border-transparent ${
                                    isDark
                                        ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-400'
                                        : 'border-gray-300'
                                }`}
                                title="Auto-detected from current page. You can edit if needed."
                            />
                            {section && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        const detected = detectCurrentSection();
                                        setSection(detected);
                                    }}
                                    className={`mt-1 text-[10px] ${isDark ? 'text-primary-400 hover:text-primary-300' : 'text-primary-600 hover:text-primary-700'} underline`}
                                >
                                    <i className="fas fa-refresh mr-1"></i>
                                    Re-detect from page
                                </button>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className={`block text-[10px] ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Type</label>
                                <select
                                    value={type}
                                    onChange={(e) => setType(e.target.value)}
                                    className={`w-full border rounded px-2 py-1 text-xs ${
                                        isDark
                                            ? 'bg-gray-700 border-gray-600 text-gray-200'
                                            : 'border-gray-300'
                                    }`}
                                >
                                    <option value="feedback">Feedback</option>
                                    <option value="bug">Bug</option>
                                    <option value="idea">Idea</option>
                                </select>
                            </div>
                            <div>
                                <label className={`block text-[10px] ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Severity</label>
                                <select
                                    value={severity}
                                    onChange={(e) => setSeverity(e.target.value)}
                                    className={`w-full border rounded px-2 py-1 text-xs ${
                                        isDark
                                            ? 'bg-gray-700 border-gray-600 text-gray-200'
                                            : 'border-gray-300'
                                    }`}
                                >
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className={`block text-[10px] ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Your message</label>
                            <textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder="Describe the issue or suggestion"
                                rows={4}
                                className={`w-full border rounded px-2 py-1 text-xs focus:ring-1 focus:ring-primary-500 focus:border-transparent ${
                                    isDark
                                        ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-400'
                                        : 'border-gray-300'
                                }`}
                            />
                        </div>
                        <button
                            onClick={submit}
                            disabled={submitting}
                            className={`w-full ${isDark ? 'bg-primary-600 hover:bg-primary-700' : 'bg-primary-600 hover:bg-primary-700'} text-white rounded px-3 py-1.5 text-xs font-medium disabled:opacity-60`}
                        >
                            {submitting ? 'Sending…' : 'Submit feedback'}
                        </button>
                        <div className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-500'} text-center`}>
                            Page: {window.location.pathname}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

window.FeedbackWidget = FeedbackWidget;


