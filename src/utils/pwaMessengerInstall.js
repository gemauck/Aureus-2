// Install Abcotronics Messenger as a standalone desktop PWA (Chrome / Edge).

let deferredPrompt = null;

export function isMessengerPwaEntry() {
    return typeof window !== 'undefined' && !!window.__PWA_MESSENGER__;
}

export function isMessengerPwaInstalled() {
    if (typeof window === 'undefined') return false;
    const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches ||
        window.navigator.standalone === true;
    return standalone && isMessengerPwaEntry();
}

export function canPromptMessengerPwaInstall() {
    return !!deferredPrompt;
}

export function initMessengerPwaInstall() {
    if (typeof window === 'undefined') return;

    window.addEventListener('beforeinstallprompt', (event) => {
        if (!isMessengerPwaEntry()) return;
        event.preventDefault();
        deferredPrompt = event;
        window.dispatchEvent(new CustomEvent('messenger-pwa:installable'));
    });

    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        window.dispatchEvent(new CustomEvent('messenger-pwa:installed'));
    });
}

export async function promptMessengerPwaInstall() {
    if (!deferredPrompt) return { outcome: 'unavailable' };
    try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice?.outcome === 'accepted') {
            deferredPrompt = null;
        }
        return choice || { outcome: 'dismissed' };
    } catch (_) {
        return { outcome: 'error' };
    }
}

export function openMessengerPwaEntry() {
    const url = '/messenger.html';
    if (window.location.pathname === '/messenger.html') {
        window.location.reload();
        return;
    }
    window.location.assign(url);
}

if (typeof window !== 'undefined') {
    initMessengerPwaInstall();
    window.pwaMessengerInstall = {
        isMessengerPwaEntry,
        isMessengerPwaInstalled,
        canPromptMessengerPwaInstall,
        promptMessengerPwaInstall,
        openMessengerPwaEntry
    };
}
