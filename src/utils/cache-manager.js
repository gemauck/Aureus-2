// Manual Cache Clear Utility
// Run this in the browser console to completely clear all caches

window.clearAllCaches = function() {
    console.log('\ud83e\uddfc Starting comprehensive cache clear...\n');
    
    let cleared = 0;
    
    // 1. Clear DatabaseAPI cache
    if (window.DatabaseAPI?.cache) {
        const dbCacheSize = window.DatabaseAPI.cache.size;
        window.DatabaseAPI.cache.clear();
        console.log(`\u2705 DatabaseAPI cache cleared (${dbCacheSize} entries)`);
        cleared += dbCacheSize;
    }
    
    // 2. Clear DataManager cache
    if (window.api?.clearCache) {
        window.api.clearCache();
        console.log('\u2705 DataManager cache cleared');
        cleared++;
    }
    
    // 3. Clear specific lead/client caches
    const cacheKeys = ['leads', 'clients', 'projects', 'opportunities'];
    cacheKeys.forEach(key => {
        if (window.api?.clearCache) {
            window.api.clearCache(key);
        }
    });
    console.log(`\u2705 Specific caches cleared: ${cacheKeys.join(', ')}`);
    
    console.log(`\n\ud83c\udf89 Total cache entries cleared: ${cleared}`);
    console.log('\ud83d\udd04 Refresh the page to load fresh data from database');
    
    return {
        cleared,
        message: 'All caches cleared successfully. Refresh the page.'
    };
};

// Also expose a function to check current cache state
window.checkCacheState = function() {
    console.log('\ud83d\udd0d Cache State Report:\n');
    
    if (window.DatabaseAPI?.cache) {
        console.log('DatabaseAPI Cache:', {
            size: window.DatabaseAPI.cache.size,
            entries: Array.from(window.DatabaseAPI.cache.keys())
        });
        
        // Show age of each cached item
        window.DatabaseAPI.cache.forEach((value, key) => {
            const ageSeconds = Math.round((Date.now() - value.timestamp) / 1000);
            console.log(`  ${key}: ${ageSeconds}s old`);
        });
    }
    
    console.log('\n\ud83d\udca1 To clear all caches, run: clearAllCaches()');
};

const cacheLog = window.debug?.log || (() => {});
cacheLog('✅ Cache management utilities loaded:');
cacheLog('  - clearAllCaches() - Clear all caches');
cacheLog('  - checkCacheState() - View current cache state');
