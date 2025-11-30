// Debug Utility - Controls logging based on environment
(function() {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    const isDevelopment = isLocalhost || hostname.startsWith('127.0.0.1') || hostname === '';
    const isProduction = !isDevelopment;

    // Check for debug flag in localStorage
    const debugEnabled = localStorage.getItem('debug') === 'true' || localStorage.getItem('debug_logging') === 'true';
    
    // Performance mode - minimize ALL logging (default: enabled to turn off debugging)
    const performanceMode = localStorage.getItem('performance_mode') !== 'false'; // Default to true unless explicitly disabled

    // Debug logger that only logs in development or when explicitly enabled
    const debug = {
        enabled: false, // Disabled by default - set localStorage.debug='true' to enable
        performanceMode: performanceMode,
        
        log(...args) {
            if (!this.performanceMode && this.enabled) {
            }
        },
        
        info(...args) {
            if (!this.performanceMode && this.enabled) {
                console.info(...args);
            }
        },
        
        warn(...args) {
            // Only suppress warnings in performance mode
            if (!this.performanceMode) {
                console.warn(...args);
            }
        },
        
        error(...args) {
            // Always show errors, even in performance mode
            console.error(...args);
        },
        
        table(...args) {
            if (this.enabled) {
                console.table(...args);
            }
        },
        
        group(...args) {
            if (this.enabled) {
                console.group(...args);
            }
        },
        
        groupEnd() {
            if (this.enabled) {
                console.groupEnd();
            }
        }
    };

    // Make available globally
    if (typeof window !== 'undefined') {
        window.debug = debug;
        // Export environment variables to window for backwards compatibility
        window.isProduction = isProduction;
        window.isDevelopment = isDevelopment;
        window.isLocalhost = isLocalhost;
    }
    
    // Export for CommonJS consumers (e.g., Node-based tests)
    const globalModule = typeof globalThis !== 'undefined' ? globalThis.module : undefined;
    if (globalModule && typeof globalModule.exports !== 'undefined') {
        globalModule.exports = debug;
    }
})();

