// Manual Cache Clear Utility
// Run this in the browser console to completely clear all caches

window.clearAllCaches = function() {
    
    let cleared = 0;
    
    // 1. Clear DatabaseAPI response cache (_responseCache)
    if (window.DatabaseAPI?._responseCache) {
        const dbCacheSize = window.DatabaseAPI._responseCache.size;
        window.DatabaseAPI._responseCache.clear();
        cleared += dbCacheSize;
    }
    
    // 2. Clear DatabaseAPI cache (legacy cache property)
    if (window.DatabaseAPI?.cache) {
        const dbCacheSize = window.DatabaseAPI.cache.size;
        window.DatabaseAPI.cache.clear();
        cleared += dbCacheSize;
    }
    
    // 3. Clear DatabaseAPI pending requests
    if (window.DatabaseAPI?._pendingRequests) {
        const pendingSize = window.DatabaseAPI._pendingRequests.size;
        window.DatabaseAPI._pendingRequests.clear();
        cleared += pendingSize;
    }
    
    // 4. Clear ComponentCache
    if (window.ComponentCache?.clear) {
        const componentCacheSize = window.ComponentCache.cache?.size || 0;
        window.ComponentCache.clear();
        cleared += componentCacheSize;
    }
    
    // 5. Clear DataManager cache
    if (window.api?.clearCache) {
        window.api.clearCache();
        cleared++;
    }
    
    // 6. Clear DataContext cache (if available)
    if (window.DataContext?.clearCache) {
        window.DataContext.clearCache();
        cleared++;
    }
    
    // 7. Clear specific lead/client caches
    const cacheKeys = ['leads', 'clients', 'projects', 'opportunities'];
    cacheKeys.forEach(key => {
        if (window.api?.clearCache) {
            window.api.clearCache(key);
        }
    });
    
    // 8. Clear localStorage cache timestamps
    try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.includes('_cache') || key.includes('_timestamp') || key.includes('_ttl'))) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        if (keysToRemove.length > 0) {
            cleared += keysToRemove.length;
        }
    } catch (e) {
        console.warn('⚠️ Could not clear localStorage cache:', e);
    }
    
    
    return {
        cleared,
        message: 'All caches cleared successfully. Refresh the page.'
    };
};

// Also expose a function to check current cache state
window.checkCacheState = function() {
    
    // Check DatabaseAPI response cache
    if (window.DatabaseAPI?._responseCache) {
        
        // Show age of each cached item
        window.DatabaseAPI._responseCache.forEach((value, key) => {
            const ageSeconds = Math.round((Date.now() - value.timestamp) / 1000);
        });
    }
    
    // Check DatabaseAPI legacy cache
    if (window.DatabaseAPI?.cache) {
    }
    
    // Check ComponentCache
    if (window.ComponentCache?.cache) {
    }
    
};

// Force refresh projects by clearing cache and reloading
window.forceRefreshProjects = async function() {
    
    // Clear all caches first
    window.clearAllCaches();
    
    // Clear projects-specific cache
    if (window.DatabaseAPI?._responseCache) {
        window.DatabaseAPI._responseCache.delete('GET:/projects');
    }
    
    // If we're on the projects page, trigger a reload
    if (window.location.hash.includes('#/projects') || window.location.pathname.includes('/projects')) {
        // Trigger a hash change to reload the component
        const currentHash = window.location.hash;
        window.location.hash = '#/projects?refresh=' + Date.now();
        setTimeout(() => {
            window.location.hash = currentHash.split('?')[0];
        }, 100);
    } else {
    }
    
    return {
        success: true,
        message: 'Projects cache cleared. Navigate to projects page to see fresh data.'
    };
};

const cacheLog = window.debug?.log || (() => {});
cacheLog('✅ Cache management utilities loaded:');
cacheLog('  - clearAllCaches() - Clear all caches');
cacheLog('  - checkCacheState() - View current cache state');
