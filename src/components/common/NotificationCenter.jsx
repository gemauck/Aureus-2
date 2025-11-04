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
    
    useEffect(() => {
        loadNotifications();
        
        // Poll for new notifications every 30 seconds
        // Only poll if we haven't paused due to auth failures
        const startPolling = () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
            }
            pollingIntervalRef.current = setInterval(() => {
                if (!isPollingPausedRef.current) {
                    loadNotifications();
                }
            }, 30000);
        };
        
        startPolling();
        
        return () => {
            if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
            }
        };
    }, []);
    
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
    
    const loadNotifications = async () => {
        // Prevent concurrent requests - if already loading, skip
        if (loading) {
            return;
        }
        
        try {
            setLoading(true);
            
            // Use DatabaseAPI.makeRequest() which handles authentication and token refresh automatically
            if (!window.DatabaseAPI || typeof window.DatabaseAPI.makeRequest !== 'function') {
                console.warn('⚠️ NotificationCenter: DatabaseAPI.makeRequest is not available');
                consecutiveFailuresRef.current++;
                if (consecutiveFailuresRef.current >= 3) {
                    isPollingPausedRef.current = true;
                }
                return;
            }
            
            try {
                const response = await window.DatabaseAPI.makeRequest('/notifications', {
                    method: 'GET'
                });
                
                // DatabaseAPI.makeRequest returns { data: {...} } structure
                const responseData = response?.data || response;
                setNotifications(responseData?.notifications || []);
                setUnreadCount(responseData?.unreadCount || 0);
                
                // Reset failure counter on success
                if (consecutiveFailuresRef.current > 0) {
                    consecutiveFailuresRef.current = 0;
                    // Resume polling if it was paused
                    if (isPollingPausedRef.current) {
                        isPollingPausedRef.current = false;
                        console.log('✅ NotificationCenter: Resuming polling after successful authentication');
                    }
                }
            } catch (error) {
                // DatabaseAPI.makeRequest throws errors for failed requests
                const errorMessage = error?.message || error?.toString() || 'Unknown error';
                if (errorMessage.includes('401') || errorMessage.includes('Unauthorized') || errorMessage.includes('Authentication expired')) {
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
                                  errorMessage.includes('ETIMEDOUT');
            const isServerError = errorMessage.includes('500') || 
                                 errorMessage.includes('502') || 
                                 errorMessage.includes('503') || 
                                 errorMessage.includes('504');
            
            if (!isDatabaseError && !isServerError) {
                console.error('❌ Error loading notifications:', error);
            }
            consecutiveFailuresRef.current++;
            // Pause polling after 5 total failures (including network errors)
            if (consecutiveFailuresRef.current >= 5) {
                isPollingPausedRef.current = true;
                console.warn('⏸️ NotificationCenter: Pausing polling due to repeated errors');
            }
        } finally {
            setLoading(false);
        }
    };
    
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
    
    const deleteNotification = async (notificationIds) => {
        try {
            if (!window.DatabaseAPI || typeof window.DatabaseAPI.makeRequest !== 'function') {
                console.warn('⚠️ NotificationCenter: DatabaseAPI.makeRequest not available for deleteNotification');
                return;
            }
            
            await window.DatabaseAPI.makeRequest('/notifications', {
                method: 'DELETE',
                body: JSON.stringify({ notificationIds })
            });
            
            loadNotifications();
        } catch (error) {
            console.error('❌ Error deleting notification:', error);
            // Don't throw - this is a non-critical operation
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
            case 'task': return 'text-purple-600';
            case 'invoice': return 'text-orange-600';
            case 'system': return 'text-gray-600';
            default: return 'text-gray-600';
        }
    };
    
    const handleNotificationClick = (notification) => {
        // Mark as read
        if (!notification.read) {
            markAsRead([notification.id]);
        }
        
        // Navigate to link if available
        if (notification.link) {
            window.location.hash = notification.link;
        }
        
        // Close dropdown
        setIsOpen(false);
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
                className={`relative ${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'} p-2 lg:p-1.5 rounded-lg transition-all duration-200 touch-target border ${isDark ? 'border-gray-600 hover:border-gray-500' : 'border-gray-200 hover:border-gray-300'} min-w-[44px] min-h-[44px] flex items-center justify-center`}
                title="Notifications"
            >
                <i className="fas fa-bell text-sm"></i>
                {unreadCount > 0 && (
                    <span className="absolute top-0 right-0 bg-red-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>
            
            {/* Dropdown Panel */}
            {isOpen && (
                <div className={`absolute right-0 mt-2 w-80 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl shadow-xl z-50 backdrop-blur-sm`}>
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
                                        onClick={() => handleNotificationClick(notification)}
                                        className={`border-b ${isDark ? 'border-gray-700 hover:bg-gray-700' : 'border-gray-100 hover:bg-gray-50'} cursor-pointer transition-colors ${
                                            !notification.read && (isDark ? 'bg-gray-750' : 'bg-blue-50')
                                        }`}
                                    >
                                        <div className="px-4 py-3">
                                            <div className="flex items-start gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
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
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                deleteNotification([notification.id]);
                                                            }}
                                                            className={`text-xs ${isDark ? 'text-gray-500 hover:text-red-400' : 'text-gray-400 hover:text-red-600'}`}
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
                    
                    {/* Footer */}
                    <div className={`px-4 py-3 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'} text-center`}>
                        <button
                            onClick={() => {
                                // Navigate to settings page using MainLayout navigation system
                                const event = new CustomEvent('navigateToPage', {
                                    detail: { page: 'settings' }
                                });
                                window.dispatchEvent(event);
                                setIsOpen(false);
                            }}
                            className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                        >
                            <i className="fas fa-cog mr-1"></i>
                            Notification Settings
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
    console.log('🔔 NotificationCenter component loaded and registered');
}

