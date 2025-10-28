// Debug Utility - Controls logging based on environment
const hostname = window.location.hostname;
const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
const isDevelopment = isLocalhost || hostname.startsWith('127.0.0.1') || hostname === '';
const isProduction = !isDevelopment;

// Check for debug flag in localStorage
const debugEnabled = localStorage.getItem('debug') === 'true' || localStorage.getItem('debug_logging') === 'true';

// Debug logger that only logs in development or when explicitly enabled
const debug = {
    enabled: isDevelopment || debugEnabled,
    
    log(...args) {
        if (this.enabled) {
            console.log(...args);
        }
    },
    
    info(...args) {
        if (this.enabled) {
            console.info(...args);
        }
    },
    
    warn(...args) {
        // Always show warnings
        console.warn(...args);
    },
    
    error(...args) {
        // Always show errors
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

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = debug;
}

