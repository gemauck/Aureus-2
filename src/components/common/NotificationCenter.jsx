// Notification Center Component
const { useState, useEffect, useRef } = React;

const NotificationCenter = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef(null);
    const { isDark } = window.useTheme();
    const consecutiveFailuresRef = useRef(0);
    const pollingIntervalRef = useRef(null);
    const isPollingPausedRef = useRef(false);
    const pollingDelayRef = useRef(15000); // Start with 15 seconds for near real-time updates, will increase on rate limits
    const lastLoadTimestampRef = useRef(0); // Throttle focus-triggered loads to avoid 429s
    const FOCUS_LOAD_MIN_INTERVAL_MS = 20000; // Don't load on focus if we loaded in the last 20 seconds
    
    // Helper function to restart polling - will be defined after loadNotifications
    const restartPollingRef = useRef(null);
    
    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    
    // Helper to handle token refresh on 401 errors
    const fetchWithRefresh = async (url, options = {}) => {
        let token = window.storage?.getToken?.();
        if (!token) {
            throw new Error('No token available');
        }
        
        const apiBase = window.DatabaseAPI?.API_BASE || window.location.origin;
        const fullUrl = url.startsWith('http') ? url : `${apiBase}${url}`;
        
        const requestOptions = {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                ...(options.headers || {})
            },
            credentials: 'include'
        };
        
        let response = await fetch(fullUrl, requestOptions);
        
        // If 401, try to refresh token and retry once
        if (!response.ok && response.status === 401) {
            try {
                const refreshUrl = `${apiBase}/api/auth/refresh`;
                const refreshRes = await fetch(refreshUrl, { 
                    method: 'POST', 
                    credentials: 'include', 
                    headers: { 'Content-Type': 'application/json' } 
                });
                
                if (refreshRes.ok) {
                    const text = await refreshRes.text();
                    const refreshData = text ? JSON.parse(text) : {};
                    const newToken = refreshData?.data?.accessToken || refreshData?.accessToken;
                    
                    if (newToken && window.storage?.setToken) {
                        window.storage.setToken(newToken);
                        requestOptions.headers['Authorization'] = `Bearer ${newToken}`;
                        response = await fetch(fullUrl, requestOptions);
                    }
                }
            } catch (refreshError) {
                console.error('❌ Token refresh failed:', refreshError);
            }
        }
        
        return response;
    };
    
    const loadNotifications = async (opts = {}) => {
        const silent = opts?.silent === true;
        // Prevent concurrent requests - if already loading, skip (unless silent background refresh)
        if (loading && !silent) {
            return;
        }
        
        // Check for global rate limits before making request
        if (window.RateLimitManager && window.RateLimitManager.isRateLimited()) {
            const waitSeconds = window.RateLimitManager.getWaitTimeRemaining();
            const waitMinutes = Math.round(waitSeconds / 60);
            console.warn(`⏸️ NotificationCenter: Global rate limit active. Pausing polling for ${waitMinutes} minute(s).`);
            isPollingPausedRef.current = true;
            // Schedule restart after rate limit expires
            const waitTime = waitSeconds * 1000;
            setTimeout(() => {
                isPollingPausedRef.current = false;
                pollingDelayRef.current = 15000; // Reset to 15 seconds
                if (restartPollingRef.current) restartPollingRef.current();
            }, waitTime);
            return;
        }
        
        try {
            if (!silent) setLoading(true);
            
            // Use DatabaseAPI.makeRequest() which handles authentication and token refresh automatically
            if (!window.DatabaseAPI || typeof window.DatabaseAPI.makeRequest !== 'function') {
                console.warn('⚠️ NotificationCenter: DatabaseAPI.makeRequest is not available');
                consecutiveFailuresRef.current++;
                if (consecutiveFailuresRef.current >= 3) {
                    isPollingPausedRef.current = true;
                }
                return;
            }
            
            // Check rate limit before making request
            if (window.RateLimitManager && window.RateLimitManager.isRateLimited()) {
                const waitSeconds = window.RateLimitManager.getWaitTimeRemaining();
                const waitMinutes = Math.round(waitSeconds / 60);
                console.warn(`⏸️ NotificationCenter: Rate limit active, skipping load. Waiting ${waitMinutes} minute(s)...`);
                // Increase polling delay and restart
                pollingDelayRef.current = Math.max(pollingDelayRef.current, waitSeconds * 1000);
                if (restartPollingRef.current) restartPollingRef.current();
                return;
            }
            
            try {
                const response = await window.DatabaseAPI.makeRequest('/notifications', {
                    method: 'GET'
                });
                
                // DatabaseAPI.makeRequest returns { data: {...} } structure
                const responseData = response?.data || response;
                const fromServer = responseData?.notifications || [];
                const newUnread = responseData?.unreadCount ?? 0;
                setUnreadCount(newUnread);
                // Silent poll: only update list if it changed, to avoid full re-render/flash
                if (silent) {
                    setNotifications((prev) => {
                        if (prev.length === fromServer.length && fromServer.every((n, i) => prev[i]?.id === n?.id))
                            return prev;
                        return fromServer;
                    });
                } else {
                    setNotifications(fromServer);
                }
                
                // Track successful load time for focus throttling
                lastLoadTimestampRef.current = Date.now();
                // Reset failure counter on success
                if (consecutiveFailuresRef.current > 0) {
                    consecutiveFailuresRef.current = 0;
                    // Reset polling delay to normal (15 seconds)
                    pollingDelayRef.current = 15000;
                    // Resume polling if it was paused
                    if (isPollingPausedRef.current) {
                        isPollingPausedRef.current = false;
                        // Restart polling with normal delay
                        if (restartPollingRef.current) restartPollingRef.current();
                    } else if (pollingDelayRef.current !== 15000) {
                        // If delay was increased due to rate limiting, restart with normal delay
                        if (restartPollingRef.current) restartPollingRef.current();
                    }
                }
            } catch (error) {
                // DatabaseAPI.makeRequest throws errors for failed requests
                const errorMessage = error?.message || error?.toString() || 'Unknown error';
                const isRateLimit = error?.status === 429 || errorMessage.includes('429') || errorMessage.includes('Too many requests') || errorMessage.includes('rate limit');
                
                if (isRateLimit) {
                    consecutiveFailuresRef.current++;
                    // Check for global rate limit state
                    const retryAfter = error?.retryAfter || 900; // Default 15 minutes
                    const waitSeconds = retryAfter;
                    const waitMinutes = Math.round(waitSeconds / 60);
                    
                    // Pause polling completely until rate limit expires
                    isPollingPausedRef.current = true;
                    pollingDelayRef.current = Math.max(waitSeconds * 1000, 300000); // At least 5 minutes
                    
                    console.warn(`⏸️ NotificationCenter: Rate limit hit. Pausing polling for ${waitMinutes} minute(s).`);
                    
                    // Schedule restart after rate limit expires
                    setTimeout(() => {
                        isPollingPausedRef.current = false;
                        pollingDelayRef.current = 15000; // Reset to 15 seconds
                        consecutiveFailuresRef.current = 0; // Reset failure counter
                        if (restartPollingRef.current) restartPollingRef.current();
                    }, waitSeconds * 1000);
                    
                    // Re-throw to be caught by outer catch
                    throw error;
                } else if (errorMessage.includes('401') || errorMessage.includes('Unauthorized') || errorMessage.includes('Authentication expired')) {
                    consecutiveFailuresRef.current++;
                    // Pause polling after 3 consecutive 401 errors
                    if (consecutiveFailuresRef.current >= 3) {
                        isPollingPausedRef.current = true;
                        console.warn('⏸️ NotificationCenter: Pausing polling due to consecutive 401 errors. Token may be invalid.');
                    } else {
                        console.warn(`⚠️ NotificationCenter: Unauthorized (${consecutiveFailuresRef.current}/3 failures)`);
                    }
                } else {
                    // For other errors, don't increment failure counter (might be temporary network issues)
                    console.warn(`⚠️ NotificationCenter: Failed to load:`, errorMessage);
                }
                // Re-throw to be caught by outer catch if needed
                throw error;
            }
        } catch (error) {
            // Suppress error logs for database connection errors and server errors (500, 502, 503, 504)
            const errorMessage = error?.message || String(error);
            const isDatabaseError = errorMessage.includes('Database connection failed') ||
                                  errorMessage.includes('unreachable') ||
                                  errorMessage.includes('ECONNREFUSED') ||
                                  errorMessage.includes('connection refused') ||
                                  errorMessage.includes('econnrefused') ||
                                  errorMessage.includes('ETIMEDOUT');
            const isServerError = errorMessage.includes('500') || 
                                 errorMessage.includes('502') || 
                                 errorMessage.includes('503') || 
                                 errorMessage.includes('504');
            
            const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('Timeout');
            if (!isDatabaseError && !isServerError) {
                console.error('❌ Error loading notifications:', error);
            }
            // Don't count timeout toward "repeated errors" - slow server shouldn't permanently pause polling
            if (!isTimeout) {
                consecutiveFailuresRef.current++;
            }
            // Pause polling after 5 total failures (excluding timeouts)
            if (consecutiveFailuresRef.current >= 5) {
                isPollingPausedRef.current = true;
                console.warn('⏸️ NotificationCenter: Pausing polling due to repeated errors');
            }
        } finally {
            if (!silent) setLoading(false);
        }
    };
    
    // Initialize polling after loadNotifications is defined
    useEffect(() => {
        // Define restart polling function that calls loadNotifications
        restartPollingRef.current = () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
            }
            if (!isPollingPausedRef.current) {
                pollingIntervalRef.current = setInterval(() => {
                    if (!isPollingPausedRef.current) {
                        // Check rate limit before polling
                        if (window.RateLimitManager && window.RateLimitManager.isRateLimited()) {
                            const waitSeconds = window.RateLimitManager.getWaitTimeRemaining();
                            const waitMinutes = Math.round(waitSeconds / 60);
                            console.warn(`⏸️ NotificationCenter: Rate limit active, skipping poll. Waiting ${waitMinutes} minute(s)...`);
                            return;
                        }
                        loadNotifications({ silent: true });
                    }
                }, pollingDelayRef.current);
            }
        };
        
        // Load notifications immediately on mount (with a small delay to avoid rate limiting)
        // Then start polling at regular intervals
        setTimeout(() => {
            loadNotifications();
            restartPollingRef.current();
        }, 1000); // Small 1-second delay to avoid immediate requests on page load
        
        // Reload notifications when window regains focus (user returns to tab)
        // Throttle: only load if we haven't loaded in the last FOCUS_LOAD_MIN_INTERVAL_MS to avoid 429s
        const handleFocus = () => {
            if (isPollingPausedRef.current) return;
            const now = Date.now();
            if (now - lastLoadTimestampRef.current < FOCUS_LOAD_MIN_INTERVAL_MS) return;
            loadNotifications({ silent: true });
        };
        window.addEventListener('focus', handleFocus);
        
        return () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
            }
            window.removeEventListener('focus', handleFocus);
        };
    }, []);
    
    const markAsRead = async (notificationIds) => {
        try {
            if (!window.DatabaseAPI || typeof window.DatabaseAPI.makeRequest !== 'function') {
                console.warn('⚠️ NotificationCenter: DatabaseAPI.makeRequest not available for markAsRead');
                return;
            }
            
            await window.DatabaseAPI.makeRequest('/notifications', {
                method: 'PATCH',
                body: JSON.stringify({ read: true, notificationIds })
            });
            
            loadNotifications(); // Reload to update counts
        } catch (error) {
            console.error('❌ Error marking notifications as read:', error);
            // Don't throw - this is a non-critical operation
        }
    };
    
    const deleteNotification = async (notificationIds, options = {}) => {
        const optimistic = options.optimistic !== false;
        const ids = Array.isArray(notificationIds) ? notificationIds : [notificationIds].filter(Boolean);
        if (!ids.length) return;
        try {
            // Optimistic update: remove from UI immediately
            if (optimistic) {
                const removedUnread = notifications.filter((n) => ids.includes(n.id) && !n.read).length;
                setNotifications((prev) => prev.filter((n) => !ids.includes(n.id)));
                setUnreadCount((c) => Math.max(0, c - removedUnread));
            }
            const apiBase = window.DatabaseAPI?.API_BASE || window.location.origin;
            const url = `${apiBase}/api/notifications`;
            // Use fetchWithRefresh so body is always sent (some environments drop DELETE body)
            const res = await fetchWithRefresh(url, {
                method: 'DELETE',
                body: JSON.stringify({ notificationIds: ids })
            });
            if (!res.ok) {
                // Fallback: send ids in query if server supports it (e.g. when body was stripped)
                const fallback = await fetchWithRefresh(`${url}?ids=${encodeURIComponent(ids.join(','))}`, { method: 'DELETE' });
                if (!fallback.ok) {
                    const err = new Error(res.statusText || 'Delete failed');
                    err.status = res.status;
                    throw err;
                }
            }
            if (!optimistic) loadNotifications();
        } catch (error) {
            console.error('❌ Error deleting notification:', error);
            // Reload to restore state on failure
            loadNotifications();
        }
    };
    
    const formatTimeAgo = (date) => {
        const now = new Date();
        const notificationDate = new Date(date);
        const diffInSeconds = Math.floor((now - notificationDate) / 1000);
        
        if (diffInSeconds < 60) return 'just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
        return notificationDate.toLocaleDateString();
    };
    
    const getNotificationIcon = (type) => {
        switch(type) {
            case 'mention': return 'fa-at';
            case 'comment': return 'fa-comment';
            case 'task': return 'fa-tasks';
            case 'invoice': return 'fa-file-invoice';
            case 'system': return 'fa-info-circle';
            default: return 'fa-bell';
        }
    };
    
    const getNotificationColor = (type) => {
        switch(type) {
            case 'mention': return 'text-blue-600';
            case 'comment': return 'text-green-600';
            case 'task': return 'text-primary-600';
            case 'invoice': return 'text-orange-600';
            case 'system': return 'text-gray-600';
            default: return 'text-gray-600';
        }
    };
    
    const handleNotificationClick = (notification, event) => {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
            if (event.target.closest('button[data-delete-notification]')) return;
        }
        if (!notification.read) {
            markAsRead([notification.id]);
        }
        setIsOpen(false);
        if (window.NotificationUrlHelper && window.NotificationUrlHelper.navigateToNotification) {
            window.NotificationUrlHelper.navigateToNotification(notification);
        } else {
            const rawUrl = window.NotificationUrlHelper ? window.NotificationUrlHelper.getUrlFromNotification(notification) : '/dashboard';
            const hash = rawUrl && (rawUrl.startsWith('#') ? rawUrl : (rawUrl.startsWith('/') ? '#' + rawUrl : '#/' + rawUrl));
            window.location.hash = hash || '#/dashboard';
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Bell Icon Button */}
            <button
                onClick={() => {
                    setIsOpen(!isOpen);
                    // Reload notifications when opening dropdown and resume polling if paused
                    if (!isOpen) {
                        // Force resume polling when user opens dropdown
                        if (isPollingPausedRef.current) {
                            isPollingPausedRef.current = false;
                            consecutiveFailuresRef.current = 0;
                        }
                        loadNotifications();
                    }
                }}
                className={`relative ${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'} p-2 lg:p-1.5 rounded-xl transition-all duration-200 touch-target border ${isDark ? 'border-gray-600 hover:border-gray-500' : 'border-gray-200/90 hover:border-gray-300 hover:shadow-sm'} min-w-[44px] min-h-[44px] max-w-[44px] max-h-[44px] flex items-center justify-center notification-button`}
                title="Notifications"
                style={{ overflow: 'hidden', position: 'relative' }}
            >
                <span className="relative inline-flex items-center justify-center notification-icon-wrapper" style={{ width: '100%', height: '100%', position: 'relative' }}>
                    <i className="fas fa-bell text-sm"></i>
                    {unreadCount > 0 && (
                        <span className="absolute notification-badge bg-red-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center z-10" style={{ top: '4px', right: '4px', position: 'absolute' }}>
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                    )}
                </span>
            </button>
            
            {/* Dropdown Panel */}
            {isOpen && (
                <div className={`absolute right-0 mt-2 w-80 ${isDark ? 'bg-gray-800/98 border-gray-700' : 'bg-white/98 border-gray-200'} border rounded-2xl shadow-xl shadow-gray-900/10 ring-1 ring-black/5 z-50 backdrop-blur-md`}>
                    {/* Header */}
                    <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                        <h3 className={`font-semibold ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                            Notifications
                            {unreadCount > 0 && (
                                <span className={`ml-2 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                    ({unreadCount} unread)
                                </span>
                            )}
                        </h3>
                        {unreadCount > 0 && (
                            <button
                                onClick={() => {
                                    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
                                    if (unreadIds.length > 0) {
                                        markAsRead(unreadIds);
                                    }
                                }}
                                className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                            >
                                Mark all read
                            </button>
                        )}
                    </div>
                    
                    {/* Notifications List */}
                    <div className="max-h-96 overflow-y-auto">
                        {loading && notifications.length === 0 ? (
                            <div className={`px-4 py-8 text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                <i className="fas fa-spinner fa-spin text-2xl mb-2"></i>
                                <p className="text-sm">Loading notifications...</p>
                            </div>
                        ) : notifications.length === 0 ? (
                            <div className={`px-4 py-8 text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                <i className="fas fa-bell-slash text-2xl mb-2"></i>
                                <p className="text-sm">No notifications yet</p>
                            </div>
                        ) : (
                            <div>
                                {notifications.map((notification) => (
                                    <div
                                        key={notification.id}
                                        onClick={(e) => handleNotificationClick(notification, e)}
                                        onMouseDown={(e) => {
                                            // Ensure clicks work even on child elements
                                            if (e.target.closest('button[data-delete-notification]')) {
                                                return; // Let delete button handle its own click
                                            }
                                        }}
                                        className={`border-b ${isDark ? 'border-gray-700 hover:bg-gray-700' : 'border-gray-100 hover:bg-gray-50'} cursor-pointer transition-colors ${
                                            !notification.read && (isDark ? 'bg-gray-750' : 'bg-blue-50/90')
                                        }`}
                                        style={{ userSelect: 'none' }}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                handleNotificationClick(notification, e);
                                            }
                                        }}
                                    >
                                        <div className="px-4 py-3">
                                            <div className="flex items-start gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                                                    <i className={`fas ${getNotificationIcon(notification.type)} ${getNotificationColor(notification.type)} text-sm`}></i>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between">
                                                        <p className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                                                            {notification.title}
                                                        </p>
                                                        {!notification.read && (
                                                            <span className="w-2 h-2 rounded-full bg-primary-600 ml-2 flex-shrink-0 mt-1"></span>
                                                        )}
                                                    </div>
                                                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'} mt-1 line-clamp-2`}>
                                                        {notification.message}
                                                    </p>
                                                    <div className="flex items-center justify-between mt-2">
                                                        <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                                            {formatTimeAgo(notification.createdAt)}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            data-delete-notification="true"
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                deleteNotification([notification.id]);
                                                            }}
                                                            onMouseDown={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                            }}
                                                            className={`text-xs ${isDark ? 'text-gray-500 hover:text-red-400' : 'text-gray-400 hover:text-red-600'} p-1`}
                                                            title="Dismiss notification"
                                                        >
                                                            <i className="fas fa-times"></i>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className={`border-t ${isDark ? 'border-gray-700' : 'border-gray-200'} px-4 py-2`}>
                        <button
                            type="button"
                            onClick={() => {
                                setIsOpen(false);
                                window.location.hash = '#/notifications';
                            }}
                            className={`w-full text-center text-sm font-medium py-2 rounded-lg transition-colors ${isDark ? 'text-primary-400 hover:bg-gray-700' : 'text-primary-600 hover:bg-gray-100'}`}
                        >
                            View all notifications
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

// Make available globally
if (typeof window !== 'undefined') {
    window.NotificationCenter = NotificationCenter;
}

