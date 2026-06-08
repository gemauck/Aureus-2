// Browser (Chrome/desktop) notifications for Messenger — preference is per-browser in localStorage.

const STORAGE_KEY = 'abcotronics_chat_browser_notifications';

export function isBrowserNotificationSupported() {
    return typeof window !== 'undefined' && 'Notification' in window;
}

export function getChatBrowserNotificationsEnabled() {
    try {
        return localStorage.getItem(STORAGE_KEY) === '1';
    } catch (_) {
        return false;
    }
}

export function setChatBrowserNotificationsEnabled(enabled) {
    try {
        if (enabled) {
            localStorage.setItem(STORAGE_KEY, '1');
        } else {
            localStorage.removeItem(STORAGE_KEY);
        }
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

if (typeof window !== 'undefined') {
    window.chatBrowserNotifications = {
        isSupported: isBrowserNotificationSupported,
        getEnabled: getChatBrowserNotificationsEnabled,
        setEnabled: setChatBrowserNotificationsEnabled,
        requestPermission: requestChatBrowserNotificationPermission,
        show: showChatBrowserNotification
    };
}
