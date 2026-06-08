// Header messages icon — unread badge + global SSE for browser notifications
const { useState, useEffect, useRef, useCallback } = React;

const MessageCenter = () => {
    const [unreadCount, setUnreadCount] = useState(0);
    const { isDark } = window.useTheme();
    const sseRef = useRef(null);
    const currentUserIdRef = useRef('');
    const activeConversationRef = useRef(null);
    const unreadCountRef = useRef(0);

    const publishUnread = useCallback((count) => {
        unreadCountRef.current = count;
        setUnreadCount(count);
        window.dispatchEvent(new CustomEvent('chat:unread', { detail: { count } }));
    }, []);

    const loadUnread = useCallback(async (silent = false) => {
        const token = window.storage?.getToken?.();
        if (!token) return;
        const apiBase = window.DatabaseAPI?.API_BASE || window.location.origin;
        try {
            const res = await fetch(`${apiBase}/api/chat/unread`, {
                headers: { Authorization: `Bearer ${token}` },
                credentials: 'include'
            });
            if (!res.ok) return;
            const json = await res.json();
            const count = json?.data?.unreadCount ?? json?.unreadCount ?? 0;
            if (silent && count === unreadCountRef.current) return;
            publishUnread(count);
        } catch (_) { /* chat tables may not exist yet */ }
    }, [publishUnread]);

    useEffect(() => {
        const user = window.storage?.getUser?.() || {};
        currentUserIdRef.current = user.id || user.userId || '';
        loadUnread();
        const interval = setInterval(() => loadUnread(true), 30000);
        const onExternalUnread = (e) => {
            const count = e.detail?.count ?? 0;
            if (count !== unreadCountRef.current) {
                unreadCountRef.current = count;
                setUnreadCount(count);
            }
        };
        window.addEventListener('chat:unread', onExternalUnread);
        return () => {
            clearInterval(interval);
            window.removeEventListener('chat:unread', onExternalUnread);
        };
    }, [loadUnread, publishUnread]);

    useEffect(() => {
        const syncActiveConversation = () => {
            const hash = window.location.hash || '';
            const hashQ = hash.split('?')[1];
            const hashParams = hashQ ? new URLSearchParams(hashQ) : null;
            const fromSearch = new URLSearchParams(window.location.search || '').get('conversation');
            activeConversationRef.current = fromSearch || hashParams?.get('conversation') || null;
        };
        syncActiveConversation();
        window.addEventListener('hashchange', syncActiveConversation);
        return () => window.removeEventListener('hashchange', syncActiveConversation);
    }, []);

    useEffect(() => {
        const user = window.storage?.getUser?.() || {};
        const userId = user.id || user.userId || '';
        currentUserIdRef.current = userId;
        const token = window.storage?.getToken?.();
        if (!token || !userId) return;

        const apiBase = window.DatabaseAPI?.API_BASE || window.location.origin;
        const url = `${apiBase}/api/chat/events?access_token=${encodeURIComponent(token)}`;
        const es = new EventSource(url);
        sseRef.current = es;

        es.addEventListener('message', (ev) => {
            let data = {};
            try {
                data = JSON.parse(ev.data || '{}');
            } catch (_) { return; }

            if (data.senderId && data.senderId === userId) {
                loadUnread(true);
                return;
            }

            loadUnread(true);

            if (data.conversationId && data.conversationId === activeConversationRef.current) return;
            if (document.hasFocus?.() && activeConversationRef.current === data.conversationId) return;

            const senderLabel = data.senderName || 'Someone';
            const preview = data.preview || 'Sent you a message';
            const browserNotif = window.chatBrowserNotifications;
            const tabFocused = document.hasFocus?.();
            const browserEnabled = browserNotif?.getEnabled?.();

            if (browserEnabled) {
                browserNotif.show({
                    title: senderLabel,
                    body: preview,
                    conversationId: data.conversationId,
                    tag: data.messageId ? `chat-msg-${data.messageId}` : undefined
                });
            }

            // In-app chime when tab is focused (OS notification may be silent) or browser notifications off.
            if (!browserEnabled || tabFocused) {
                window.notificationSounds?.play?.('message');
            }
        });

        es.addEventListener('conversation', () => loadUnread(true));

        return () => {
            es.close();
            sseRef.current = null;
        };
    }, [loadUnread, publishUnread]);

    const openMessages = () => {
        window.dispatchEvent(new CustomEvent('navigateToPage', { detail: { page: 'messages' } }));
    };

    return (
        <button
            type="button"
            onClick={openMessages}
            className={`relative ${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'} p-1.5 rounded-lg transition-all duration-200 touch-target border ${isDark ? 'border-gray-600 hover:border-gray-500' : 'border-gray-200/90 hover:border-gray-300 hover:shadow-sm'} min-w-8 min-h-8 max-w-8 max-h-8 flex items-center justify-center message-button`}
            title={unreadCount > 0 ? `${unreadCount} unread message${unreadCount === 1 ? '' : 's'}` : 'Messages'}
            style={{ overflow: 'hidden', position: 'relative' }}
        >
            <span className="relative inline-flex items-center justify-center message-icon-wrapper" style={{ width: '100%', height: '100%', position: 'relative' }}>
                <i className="fas fa-comments text-sm"></i>
                {unreadCount > 0 && (
                    <span
                        className="absolute message-badge bg-blue-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center z-10"
                        style={{ top: '4px', right: '4px', position: 'absolute' }}
                    >
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </span>
        </button>
    );
};

window.MessageCenter = MessageCenter;
export default MessageCenter;
