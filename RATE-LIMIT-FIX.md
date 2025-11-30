# Rate Limiting Fix - DatabaseAPI Improvements

## Problem
The application was experiencing frequent 429 (Too Many Requests) errors due to:
1. Too many concurrent API requests overwhelming the server
2. Insufficient retry delays when rate limited
3. Excessive cache clearing triggering new API calls
4. Components making API calls even when cache was available

## Changes Made

### 1. Reduced Concurrent Requests
**File:** `src/utils/databaseAPI.js`
- **Before:** `_maxConcurrentRequests: 4`
- **After:** `_maxConcurrentRequests: 2`
- **Impact:** Reduces server load by limiting simultaneous requests

### 2. Increased Request Interval
**File:** `src/utils/databaseAPI.js`
- **Before:** `_minRequestInterval: 250` (ms)
- **After:** `_minRequestInterval: 500` (ms)
- **Impact:** Doubles the minimum time between requests, reducing request frequency

### 3. Improved Rate Limit Retry Logic
**File:** `src/utils/databaseAPI.js`
- **Added:** Rate limit tracking (`_rateLimitCount`)
- **Before:** Retry delay capped at 15 seconds
- **After:** Retry delay capped at 60 seconds
- **Added:** Exponential backoff that factors in consecutive rate limit errors
- **Added:** Better handling of `Retry-After` headers from server
- **Impact:** More respectful of rate limits, prevents rapid retry storms

### 4. Throttled Cache Clearing
**File:** `src/utils/databaseAPI.js`
- **Added:** `_lastCacheClear` timestamp tracking
- **Added:** `_cacheClearThrottle: 2000` (2 seconds minimum between clears)
- **Impact:** Prevents excessive cache invalidation that triggers API call bursts

### 5. Throttled Endpoint Cache Clearing
**File:** `src/utils/databaseAPI.js`
- **Added:** Per-endpoint throttle tracking (`_endpointClearTimes`)
- **Added:** 1 second minimum between clears for the same endpoint
- **Impact:** Prevents rapid cache clearing for the same endpoint

### 6. Global Rate Limit Backoff
**File:** `src/utils/databaseAPI.js`
- **Enhanced:** `_acquireRequestSlot()` now checks global rate limit state
- **Added:** All requests wait when global rate limit is active
- **Impact:** Prevents new requests from being queued during rate limit periods

## Expected Results

1. **Fewer 429 Errors:** Reduced request frequency and better retry logic should prevent most rate limit errors
2. **Better Recovery:** When rate limited, the system will wait appropriately before retrying
3. **Reduced Server Load:** Fewer concurrent requests and slower request rate
4. **Less Cache Churn:** Throttled cache clearing prevents unnecessary API calls

## Testing Recommendations

1. Monitor console logs for rate limit warnings
2. Check that retry delays are being respected (should see "Retrying in Xs..." messages)
3. Verify that cache clearing is throttled (should see "Cache clear throttled" messages if clearing too frequently)
4. Confirm that 429 errors decrease over time

## Rollback

If issues occur, you can revert these changes by:
1. Restoring `_maxConcurrentRequests: 4`
2. Restoring `_minRequestInterval: 250`
3. Restoring retry delay cap to 15000ms
4. Removing cache clearing throttles

## Notes

- The changes are backward compatible
- No breaking changes to the API
- All existing functionality remains intact
- The fixes are defensive and should not affect normal operation


