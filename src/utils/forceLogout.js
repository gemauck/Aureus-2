// Centralized forced logout helper for expired/invalid sessions
if (typeof window !== 'undefined') {
	// Idempotent definition to avoid reassignments
	if (!window.forceLogout) {
		window.forceLogout = async (reason = 'SESSION_EXPIRED') => {
			try {
				// Best-effort server logout to clear refresh cookie
				if (window.api?.logout) {
					await window.api.logout();
				}
			} catch (_) {
				// ignore network/backend errors during forced logout
			}
			try {
				if (window.storage?.removeToken) window.storage.removeToken();
				if (window.storage?.removeUser) window.storage.removeUser();
			} catch (_) {
				// ignore storage errors
			}
			try {
				if (window.LiveDataSync) {
					window.LiveDataSync.stop();
				}
			} catch (_) {
				// ignore sync stop errors
			}
			try {
				// Prefer hash-based login navigation used by the app
				if (!window.location.hash.includes('#/login')) {
					window.location.hash = '#/login';
				}
			} catch (_) {
				// As a fallback, navigate to path-based login
				try {
					if (window.location.pathname !== '/login') {
						window.location.href = '/login';
					}
				} catch (__){}
			}
			// Optional: broadcast for any subscribers
			try {
				window.dispatchEvent(new CustomEvent('auth:force-logout', { detail: { reason } }));
			} catch (_) {
				// ignore
			}
		};
	}
}


