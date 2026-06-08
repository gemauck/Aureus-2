// Android ERP mobile app (React Native) sideload download helpers.

const DEFAULT_ANDROID_APK_URL = '/public/downloads/Abcotronics-ERP-Mobile.apk';

export function getDefaultAndroidApkUrl() {
    return DEFAULT_ANDROID_APK_URL;
}

export function isAndroidBrowser() {
    return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}

export function openAndroidAppDownload(url) {
    const target = url || DEFAULT_ANDROID_APK_URL;
    window.open(target, '_blank', 'noopener,noreferrer');
}

if (typeof window !== 'undefined') {
    window.mobileAppDownload = {
        getDefaultAndroidApkUrl,
        isAndroidBrowser,
        openAndroidAppDownload
    };
}
