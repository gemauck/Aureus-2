// Persistent Component Cache - survives component unmount/remount
window.ComponentCache = window.ComponentCache || {
    cache: new Map(),
    
    // Cache data with timestamp
    set(key, data, ttl = 60000) { // 60 seconds default
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl
        });
    },
    
    // Get data if still valid
    get(key) {
        const entry = this.cache.get(key);
        if (!entry) return null;
        
        const age = Date.now() - entry.timestamp;
        if (age > entry.ttl) {
            this.cache.delete(key);
            return null;
        }
        
        return entry.data;
    },
    
    // Check if data is cached and fresh
    has(key) {
        const entry = this.cache.get(key);
        if (!entry) return false;
        
        const age = Date.now() - entry.timestamp;
        return age < entry.ttl;
    },
    
    // Clear a specific cache or all
    clear(key) {
        if (key) {
            this.cache.delete(key);
        } else {
            this.cache.clear();
        }
    }
};

console.log('✅ ComponentCache loaded');

