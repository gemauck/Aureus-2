// Notifications page: full list, filters, mark read, delete, bulk actions
const { useState, useEffect, useCallback } = React;

const NOTIFICATION_ICONS = {
    mention: 'fa-at',
    comment: 'fa-comment',
    task: 'fa-tasks',
    invoice: 'fa-file-invoice',
    system: 'fa-info-circle'
};
const NOTIFICATION_COLORS = {
    mention: 'text-blue-600',
    comment: 'text-green-600',
    task: 'text-primary-600',
    invoice: 'text-orange-600',
    system: 'text-gray-600'
};

const getNotificationIcon = (type) => NOTIFICATION_ICONS[type] || 'fa-bell';
const getNotificationColor = (type) => NOTIFICATION_COLORS[type] || 'text-gray-600';

function formatTimeAgo(date) {
    const now = new Date();
    const d = new Date(date);
    const sec = Math.floor((now - d) / 1000);
    if (sec < 60) return 'just now';
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
    if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
    return d.toLocaleDateString();
}

const NotificationsPage = () => {
    const { isDark } = window.useTheme?.() || { isDark: false };
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // 'all' | 'unread'
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [actionLoading, setActionLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [offset, setOffset] = useState(0);
    const LIMIT = 50;

    const loadNotifications = useCallback(async (opts = {}) => {
        const append = opts.append === true;
        const silent = opts.silent === true;
        if (!append && !silent) setLoading(true);
        try {
            if (!window.DatabaseAPI || typeof window.DatabaseAPI.makeRequest !== 'function') {
                return;
            }
            const query = new URLSearchParams();
            query.set('limit', String(LIMIT));
            query.set('offset', append ? String(notifications.length) : '0');
            if (filter === 'unread') query.set('read', 'false');
            const url = `/notifications?${query.toString()}`;
            const response = await window.DatabaseAPI.makeRequest(url, { method: 'GET' });
            const data = response?.data || response;
            const list = data?.notifications || [];
            const count = data?.unreadCount ?? 0;
            setUnreadCount(count);
            if (append) {
                setNotifications((prev) => {
                    const byId = new Map(prev.map((n) => [n.id, n]));
                    list.forEach((n) => byId.set(n.id, n));
                    return Array.from(byId.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                });
            } else {
                setNotifications(list);
            }
            setHasMore(list.length === LIMIT);
            setOffset(append ? notifications.length + list.length : list.length);
        } catch (err) {
            if (!silent) console.warn('Notifications load failed:', err);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [filter, notifications.length]);

    useEffect(() => {
        loadNotifications();
    }, [filter]);

    const markAsRead = async (ids) => {
        if (!ids.length || !window.DatabaseAPI?.makeRequest) return;
        setActionLoading(true);
        try {
            await window.DatabaseAPI.makeRequest('/notifications', {
                method: 'PATCH',
                body: JSON.stringify({ read: true, notificationIds: ids })
            });
            setNotifications((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)));
            setUnreadCount((c) => Math.max(0, c - ids.length));
            setSelectedIds((s) => {
                const next = new Set(s);
                ids.forEach((id) => next.delete(id));
                return next;
            });
        } catch (err) {
            console.warn('Mark as read failed:', err);
        } finally {
            setActionLoading(false);
        }
    };

    const deleteNotifications = async (ids) => {
        if (!ids.length || !window.DatabaseAPI?.makeRequest) return;
        setActionLoading(true);
        try {
            await window.DatabaseAPI.makeRequest('/notifications', {
                method: 'DELETE',
                body: JSON.stringify({ notificationIds: ids })
            });
            setNotifications((prev) => prev.filter((n) => !ids.includes(n.id)));
            const removedUnread = notifications.filter((n) => ids.includes(n.id) && !n.read).length;
            setUnreadCount((c) => Math.max(0, c - removedUnread));
            setSelectedIds((s) => {
                const next = new Set(s);
                ids.forEach((id) => next.delete(id));
                return next;
            });
        } catch (err) {
            console.warn('Delete notifications failed:', err);
        } finally {
            setActionLoading(false);
        }
    };

    const handleRowClick = (notification, e) => {
        if (e.target.closest('button') || e.target.closest('input[type="checkbox"]')) return;
        e.preventDefault();
        if (!notification.read) {
            markAsRead([notification.id]);
        }
        if (window.NotificationUrlHelper?.navigateToNotification) {
            window.NotificationUrlHelper.navigateToNotification(notification);
        } else {
            const raw = window.NotificationUrlHelper?.getUrlFromNotification(notification) || '/dashboard';
            const hash = raw.startsWith('#') ? raw : raw.startsWith('/') ? '#' + raw : '#/' + raw;
            window.location.hash = hash || '#/dashboard';
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds((s) => {
            const next = new Set(s);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectAll = () => {
        if (selectedIds.size === notifications.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(notifications.map((n) => n.id)));
        }
    };

    const unreadInList = notifications.filter((n) => !n.read);
    const unreadIds = unreadInList.map((n) => n.id);
    const selectedCount = selectedIds.size;

    return (
        <div className={`erp-module-root min-w-0 max-w-full rounded-xl border ${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'} shadow-sm`}>
            <div className={`px-6 py-4 border-b ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
                <h1 className={`text-xl font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                    Notifications
                </h1>
                <div className="flex items-center gap-2 mt-3">
                    <button
                        type="button"
                        onClick={() => setFilter('all')}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            filter === 'all'
                                ? isDark
                                    ? 'bg-gray-700 text-white'
                                    : 'bg-gray-200 text-gray-900'
                                : isDark
                                    ? 'text-gray-400 hover:bg-gray-800'
                                    : 'text-gray-600 hover:bg-gray-100'
                        }`}
                    >
                        All
                    </button>
                    <button
                        type="button"
                        onClick={() => setFilter('unread')}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            filter === 'unread'
                                ? isDark
                                    ? 'bg-gray-700 text-white'
                                    : 'bg-gray-200 text-gray-900'
                                : isDark
                                    ? 'text-gray-400 hover:bg-gray-800'
                                    : 'text-gray-600 hover:bg-gray-100'
                        }`}
                    >
                        Unread
                        {unreadCount > 0 && (
                            <span className={`ml-1.5 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                ({unreadCount})
                            </span>
                        )}
                    </button>
                </div>
            </div>

            <div className={`px-4 py-2 border-b ${isDark ? 'border-gray-800' : 'border-gray-100'} flex items-center justify-between gap-2 flex-wrap`}>
                <div className="flex items-center gap-2">
                    {notifications.length > 0 && (
                        <label className={`flex items-center gap-2 text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} cursor-pointer`}>
                            <input
                                type="checkbox"
                                checked={selectedIds.size === notifications.length && notifications.length > 0}
                                onChange={selectAll}
                                className="rounded border-gray-300"
                            />
                            Select all
                        </label>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {unreadIds.length > 0 && (
                        <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => markAsRead(unreadIds)}
                            className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
                                isDark
                                    ? 'text-primary-400 hover:bg-gray-800'
                                    : 'text-primary-600 hover:bg-gray-100'
                            } ${actionLoading ? 'opacity-50 pointer-events-none' : ''}`}
                        >
                            Mark all read
                        </button>
                    )}
                    {selectedCount > 0 && (
                        <>
                            <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() => markAsRead(Array.from(selectedIds))}
                                className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
                                    isDark ? 'text-primary-400 hover:bg-gray-800' : 'text-primary-600 hover:bg-gray-100'
                                } ${actionLoading ? 'opacity-50 pointer-events-none' : ''}`}
                            >
                                Mark selected read
                            </button>
                            <button
                                type="button"
                                disabled={actionLoading}
                                onClick={() => deleteNotifications(Array.from(selectedIds))}
                                className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
                                    isDark ? 'text-red-400 hover:bg-gray-800' : 'text-red-600 hover:bg-gray-100'
                                } ${actionLoading ? 'opacity-50 pointer-events-none' : ''}`}
                            >
                                Delete selected
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="min-h-[200px]">
                {loading && notifications.length === 0 ? (
                    <div className={`py-12 text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        <i className="fas fa-spinner fa-spin text-2xl mb-2" />
                        <p className="text-sm">Loading notifications...</p>
                    </div>
                ) : notifications.length === 0 ? (
                    <div className={`py-12 text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        <i className="fas fa-bell-slash text-2xl mb-2" />
                        <p className="text-sm">
                            {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                        </p>
                    </div>
                ) : (
                    <ul className="divide-y divide-gray-200 dark:divide-gray-800">
                        {notifications.map((n) => (
                            <li
                                key={n.id}
                                onClick={(e) => handleRowClick(n, e)}
                                className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
                                    isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-50'
                                } ${!n.read && (isDark ? 'bg-gray-800/50' : 'bg-blue-50/50')}`}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        handleRowClick(n, e);
                                    }
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedIds.has(n.id)}
                                    onChange={(e) => {
                                        e.stopPropagation();
                                        toggleSelect(n.id);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="mt-1 rounded border-gray-300"
                                />
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                                    <i className={`fas ${getNotificationIcon(n.type)} ${getNotificationColor(n.type)} text-sm`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2">
                                        <p className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                                            {n.title}
                                        </p>
                                        {!n.read && (
                                            <span className="w-2 h-2 rounded-full bg-primary-600 flex-shrink-0 mt-1.5" />
                                        )}
                                    </div>
                                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'} mt-0.5 line-clamp-2`}>
                                        {n.message}
                                    </p>
                                    <div className="flex items-center justify-between mt-2">
                                        <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                            {formatTimeAgo(n.createdAt)}
                                        </span>
                                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                            {!n.read && (
                                                <button
                                                    type="button"
                                                    onClick={() => markAsRead([n.id])}
                                                    className={`text-xs px-2 py-1 rounded ${isDark ? 'text-primary-400 hover:bg-gray-700' : 'text-primary-600 hover:bg-gray-200'}`}
                                                >
                                                    Mark read
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => deleteNotifications([n.id])}
                                                className={`text-xs px-2 py-1 rounded ${isDark ? 'text-gray-400 hover:text-red-400 hover:bg-gray-700' : 'text-gray-500 hover:text-red-600 hover:bg-gray-200'}`}
                                                title="Delete"
                                            >
                                                <i className="fas fa-times" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
                {hasMore && notifications.length > 0 && !loading && (
                    <div className="p-4 text-center border-t border-gray-200 dark:border-gray-800">
                        <button
                            type="button"
                            onClick={() => loadNotifications({ append: true })}
                            disabled={loading}
                            className={`text-sm font-medium px-4 py-2 rounded-lg ${isDark ? 'text-primary-400 hover:bg-gray-800' : 'text-primary-600 hover:bg-gray-100'}`}
                        >
                            Load more
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

if (typeof window !== 'undefined') {
    window.NotificationsPage = NotificationsPage;
}

export default NotificationsPage;
