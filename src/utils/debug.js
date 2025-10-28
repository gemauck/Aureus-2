// Debug Utility - Controls logging based on environment
(function() {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    const isDevelopment = isLocalhost || hostname.startsWith('127.0.0.1') || hostname === '';
    const isProduction = !isDevelopment;

    // Check for debug flag in localStorage
    const debugEnabled = localStorage.getItem('debug') === 'true' || localStorage.getItem('debug_logging') === 'true';
    
    // Performance mode - minimize ALL logging
    const performanceMode = localStorage.getItem('performance_mode') === 'true' || (isProduction && !debugEnabled);

    // Debug logger that only logs in development or when explicitly enabled
    const debug = {
        enabled: isDevelopment || debugEnabled,
        performanceMode: performanceMode,
        
        log(...args) {
            if (!this.performanceMode && this.enabled) {
                console.log(...args);
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
    window.debug = debug;
    
    // Export environment variables to window for backwards compatibility
    window.isProduction = isProduction;
    window.isDevelopment = isDevelopment;
    window.isLocalhost = isLocalhost;
})();

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = debug;
}

