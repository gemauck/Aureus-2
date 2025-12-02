# Cache Clearing Fix - Old Projects Platform Issue

## Problem
The application was loading an old projects platform due to multiple caching layers:
- Browser cache serving old JavaScript files
- DatabaseAPI response cache (5-second TTL)
- ComponentCache caching component data
- DataContext cache (30-minute TTL for projects)

## Solution
Implemented comprehensive cache clearing mechanisms to force fresh loads when needed.

## Changes Made

### 1. Enhanced Cache Manager (`src/utils/cache-manager.js`)
- **Updated `clearAllCaches()`**: Now clears all cache layers including:
  - DatabaseAPI response cache (`_responseCache`)
  - DatabaseAPI pending requests
  - ComponentCache
  - DataContext cache
  - LocalStorage cache timestamps
  
- **New `forceRefreshProjects()` function**: 
  - Clears all caches
  - Specifically clears projects cache
  - Triggers a reload if on projects page

### 2. DatabaseAPI Cache Methods (`src/utils/databaseAPI.js`)
- **Added `clearCache()` method**: Clears all DatabaseAPI caches
- **Added `clearEndpointCache(endpoint, method)` method**: Clears cache for specific endpoints
- **Auto-clear on load**: Checks for `__CLEAR_DATABASE_CACHE_ON_LOAD__` flag and clears cache automatically

### 3. Projects Component (`src/components/projects/Projects.jsx`)
- **Refresh parameter detection**: Checks for `?refresh` or `?forceRefresh` in URL
- **Automatic cache clearing**: Clears projects cache when refresh parameter is detected
- **Fresh data loading**: Forces fresh API call after cache clear

### 4. Early Cache Clearing Script (`index.html`)
- **Runs on page load**: Checks for cache clearing flags
- **URL parameter support**: `?clearCache` or `?forceRefresh`
- **Hash parameter support**: `#/projects?clearCache` or `#/projects?forceRefresh`
- **LocalStorage flag**: `abcotronics_force_clear_cache=true`
- **Sets flag for DatabaseAPI**: Sets `__CLEAR_DATABASE_CACHE_ON_LOAD__` for automatic clearing

## How to Use

### Method 1: URL Parameters (Easiest)
Add `?clearCache` or `?forceRefresh` to your URL:
```
https://abcoafrica.co.za/projects?clearCache
https://abcoafrica.co.za/#/projects?forceRefresh
```

### Method 2: Browser Console
Open browser console and run:
```javascript
// Clear all caches
clearAllCaches()

// Force refresh projects specifically
forceRefreshProjects()

// Check cache state
checkCacheState()
```

### Method 3: LocalStorage Flag
Set a flag that will be cleared on next page load:
```javascript
localStorage.setItem('abcotronics_force_clear_cache', 'true')
// Then refresh the page
```

### Method 4: Hard Refresh
Use browser hard refresh:
- **Chrome/Edge**: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
- **Firefox**: `Ctrl+F5` (Windows) or `Cmd+Shift+R` (Mac)
- **Safari**: `Cmd+Option+R` (Mac)

## Cache Layers Cleared

1. **DatabaseAPI Response Cache** - 5-second TTL cache for API responses
2. **DatabaseAPI Pending Requests** - Prevents duplicate concurrent requests
3. **ComponentCache** - Component-level data cache (60-second TTL)
4. **DataContext Cache** - React context cache (30-minute TTL for projects)
5. **LocalStorage Cache Timestamps** - Cache validity timestamps
6. **SessionStorage** - Session-level cache

## Testing

1. **Test cache clearing**:
   ```javascript
   // In browser console
   checkCacheState()  // See current cache state
   clearAllCaches()   // Clear all caches
   checkCacheState()  // Verify caches are cleared
   ```

2. **Test projects refresh**:
   - Navigate to projects page
   - Add `?forceRefresh` to URL
   - Verify projects load fresh from database

3. **Test automatic clearing**:
   - Set `localStorage.setItem('abcotronics_force_clear_cache', 'true')`
   - Refresh page
   - Verify cache is cleared automatically

## Prevention

To prevent old platform from loading:
1. Always use hard refresh (`Ctrl+Shift+R` / `Cmd+Shift+R`) after deployments
2. Add `?clearCache` to URL if you suspect stale cache
3. Use `forceRefreshProjects()` in console if projects seem outdated
4. Check `checkCacheState()` to verify cache age

## Notes

- Cache clearing is non-destructive - it only clears cached data, not user preferences
- The 5-second DatabaseAPI cache is intentional to reduce API calls
- ComponentCache has a 60-second TTL to balance performance and freshness
- DataContext cache has longer TTLs (30 minutes for projects) for performance

## Future Improvements

- Add cache versioning to detect stale cache automatically
- Add UI button to force refresh projects
- Add automatic cache invalidation on data updates
- Add cache age indicators in development mode







