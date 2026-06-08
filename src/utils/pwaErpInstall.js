// Install Abcotronics ERP as a standalone desktop PWA (Chrome / Edge).

let deferredPrompt = null;

export function isMessengerPwaEntry() {
    return typeof window !== 'undefined' && !!window.__PWA_MESSENGER__;
}

export function isErpPwaEntry() {
    if (typeof window === 'undefined') return false;
    if (isMessengerPwaEntry()) return false;
    const path = window.location.pathname || '/';
    return path === '/app.html' || path === '/' || path === '/index.html';
}

export function isStandaloneDisplayMode() {
    if (typeof window === 'undefined') return false;
    return (
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches ||
        window.navigator.standalone === true
    );
}

export function isErpPwaInstalled() {
    return isStandaloneDisplayMode() && !isMessengerPwaEntry();
}

export function canPromptErpPwaInstall() {
    return !!deferredPrompt;
}

export function initErpPwaInstall() {
    if (typeof window === 'undefined') return;

    window.addEventListener('beforeinstallprompt', (event) => {
        if (isMessengerPwaEntry()) return;
        event.preventDefault();
        deferredPrompt = event;
        window.dispatchEvent(new CustomEvent('erp-pwa:installable'));
    });

    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        window.dispatchEvent(new CustomEvent('erp-pwa:installed'));
    });
}

export async function promptErpPwaInstall() {
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

export function openErpPwaEntry() {
    const url = '/app.html';
    if (window.location.pathname === '/app.html') {
        window.location.reload();
        return;
    }
    window.location.assign(url);
}

if (typeof window !== 'undefined') {
    initErpPwaInstall();
    window.pwaErpInstall = {
        isErpPwaEntry,
        isErpPwaInstalled,
        canPromptErpPwaInstall,
        promptErpPwaInstall,
        openErpPwaEntry
    };
}
