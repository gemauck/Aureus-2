// Browser (Chrome/desktop) notifications for Messenger — preference is per-browser in localStorage.

const STORAGE_KEY = 'abcotronics_chat_browser_notifications';

export function isBrowserNotificationSupported() {
    return typeof window !== 'undefined' && 'Notification' in window;
}

export function getChatBrowserNotificationsEnabled() {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        return v !== '0';
    } catch (_) {
        return true;
    }
}

export function setChatBrowserNotificationsEnabled(enabled) {
    try {
        localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
    } catch (_) { /* private mode */ }
}

export async function requestChatBrowserNotificationPermission() {
    if (!isBrowserNotificationSupported()) {
        return 'unsupported';
    }
    if (Notification.permission === 'granted') {
        return 'granted';
    }
    if (Notification.permission === 'denied') {
        return 'denied';
    }
    try {
        return await Notification.requestPermission();
    } catch (_) {
        return 'denied';
    }
}

export function showChatBrowserNotification({ title, body, conversationId, tag } = {}) {
    if (!isBrowserNotificationSupported()) return null;
    if (Notification.permission !== 'granted') return null;
    if (!getChatBrowserNotificationsEnabled()) return null;

    try {
        const notification = new Notification(title || 'New message', {
            body: body || 'You have a new message',
            icon: '/favicon.ico',
            tag: tag || (conversationId ? `chat-${conversationId}` : 'chat-message'),
            silent: false
        });

        notification.onclick = () => {
            window.focus();
            notification.close();
            window.dispatchEvent(new CustomEvent('navigateToPage', { detail: { page: 'messages' } }));
            if (conversationId) {
                const base = (window.location.hash || '#/messages').split('?')[0] || '#/messages';
                const next = `${base}?conversation=${encodeURIComponent(conversationId)}`;
                if (window.history.replaceState) {
                    window.history.replaceState(null, '', next);
                } else {
                    window.location.hash = next;
                }
                window.dispatchEvent(new HashChangeEvent('hashchange'));
            }
        };

        setTimeout(() => notification.close(), 8000);
        return notification;
    } catch (_) {
        return null;
    }
}

export function showChatCallBrowserNotification({ title, body, conversationId, callId, media } = {}) {
    if (!isBrowserNotificationSupported()) return null;
    if (Notification.permission !== 'granted') return null;
    if (!getChatBrowserNotificationsEnabled()) return null;

    try {
        const notification = new Notification(title || 'Incoming call', {
            body: body || (media === 'video' ? 'Video call' : 'Voice call'),
            icon: '/favicon.ico',
            tag: callId ? `chat-call-${callId}` : (conversationId ? `chat-call-${conversationId}` : 'chat-call'),
            silent: false,
            requireInteraction: true
        });

        notification.onclick = () => {
            window.focus();
            notification.close();
            window.dispatchEvent(new CustomEvent('navigateToPage', { detail: { page: 'messages' } }));
            if (conversationId) {
                const base = (window.location.hash || '#/messages').split('?')[0] || '#/messages';
                const params = new URLSearchParams();
                params.set('conversation', conversationId);
                if (callId) params.set('call', callId);
                const next = `${base}?${params.toString()}`;
                if (window.history.replaceState) {
                    window.history.replaceState(null, '', next);
                } else {
                    window.location.hash = next;
                }
                window.dispatchEvent(new HashChangeEvent('hashchange'));
            }
            window.dispatchEvent(new CustomEvent('chat:call-focus', {
                detail: { conversationId, callId, media }
            }));
        };

        setTimeout(() => notification.close(), 45000);
        return notification;
    } catch (_) {
        return null;
    }
}

/** After login, request OS permission on first click/key if preference is on (browser policy). */
export async function ensureBrowserNotificationPermission() {
    if (!getChatBrowserNotificationsEnabled()) return Notification?.permission || 'default';
    return requestChatBrowserNotificationPermission();
}

if (typeof window !== 'undefined') {
    const primePermission = () => {
        if (!getChatBrowserNotificationsEnabled()) return;
        if (Notification.permission !== 'default') return;
        void requestChatBrowserNotificationPermission();
    };
    window.addEventListener('pointerdown', primePermission, { once: true, passive: true });
    window.addEventListener('keydown', primePermission, { once: true });

    window.chatBrowserNotifications = {
        isSupported: isBrowserNotificationSupported,
        getEnabled: getChatBrowserNotificationsEnabled,
        setEnabled: setChatBrowserNotificationsEnabled,
        requestPermission: requestChatBrowserNotificationPermission,
        ensurePermission: ensureBrowserNotificationPermission,
        show: showChatBrowserNotification,
        showCall: showChatCallBrowserNotification
    };
}
