// In-app notification chimes for web ERP (tab focused or when OS notifications are off).

const STORAGE_KEY = 'abcotronics_notification_sounds_enabled';

let audioCtx = null;
let unlocked = false;
let lastPlayedAt = 0;
const MIN_GAP_MS = 1200;

function getAudioContext() {
    if (typeof window === 'undefined') return null;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx();
    return audioCtx;
}

export function isNotificationSoundSupported() {
    return !!getAudioContext();
}

export function getNotificationSoundsEnabled() {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        return v !== '0';
    } catch (_) {
        return true;
    }
}

export function setNotificationSoundsEnabled(enabled) {
    try {
        localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
    } catch (_) { /* private mode */ }
}

/** Call once after a user gesture so autoplay policies allow chimes. */
export function unlockNotificationSounds() {
    const ctx = getAudioContext();
    if (!ctx || unlocked) return;
    try {
        if (ctx.state === 'suspended') void ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.0001;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.01);
        unlocked = true;
    } catch (_) { /* ignore */ }
}

const SOUND_VOLUME = 1.55;

function playTone(ctx, freq, start, duration, peak = 0.22) {
    const level = Math.min(0.85, peak * SOUND_VOLUME);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(level, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
}

function playNotificationVibration(kind = 'notification') {
    try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate(kind === 'message' ? [0, 200, 100, 200, 100, 200] : [0, 150, 80, 150]);
        }
    } catch (_) { /* unsupported */ }
}

let callRingTimer = null;

function playCallChime(ctx) {
    const t0 = ctx.currentTime + 0.01;
    playTone(ctx, 523, t0, 0.18, 0.28);
    playTone(ctx, 659, t0 + 0.2, 0.18, 0.26);
    playTone(ctx, 784, t0 + 0.4, 0.22, 0.24);
}

/**
 * @param {'message' | 'notification' | 'call'} kind
 */
export function playNotificationSound(kind = 'notification') {
    if (!getNotificationSoundsEnabled()) return;
    const now = Date.now();
    if (kind !== 'call' && now - lastPlayedAt < MIN_GAP_MS) return;

    playNotificationVibration(kind === 'call' ? 'message' : kind);

    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();

    const t0 = ctx.currentTime + 0.01;
    if (kind === 'message') {
        playTone(ctx, 880, t0, 0.1, 0.24);
        playTone(ctx, 1175, t0 + 0.11, 0.14, 0.22);
    } else if (kind === 'call') {
        playCallChime(ctx);
    } else {
        playTone(ctx, 660, t0, 0.11, 0.22);
        playTone(ctx, 880, t0 + 0.13, 0.16, 0.2);
    }
    lastPlayedAt = now;
}

/** Ring repeatedly while an incoming call is waiting (stops when stopCallRing is called). */
export function startCallRing() {
    stopCallRing();
    const tick = () => {
        playNotificationSound('call');
    };
    tick();
    callRingTimer = setInterval(tick, 2800);
}

export function stopCallRing() {
    if (callRingTimer) {
        clearInterval(callRingTimer);
        callRingTimer = null;
    }
}

if (typeof window !== 'undefined') {
    const unlock = () => unlockNotificationSounds();
    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true });

    window.notificationSounds = {
        isSupported: isNotificationSoundSupported,
        getEnabled: getNotificationSoundsEnabled,
        setEnabled: setNotificationSoundsEnabled,
        unlock: unlockNotificationSounds,
        play: playNotificationSound,
        startCallRing,
        stopCallRing
    };
}
