# Cache Invalidation & Connection Fixes

## Problems Identified

### 1. **Backend Server Connection Failures** 🔴
- `ERR_CONNECTION_REFUSED` errors for `/api/contacts` and `/api/sites`
- Server appears to crash or become unresponsive after save operations
- Connection pool may be exhausted

### 2. **Cache Not Invalidated After Creates** 🔴
- Opportunities created successfully but cache shows 0 items
- Cache populated BEFORE creation isn't cleared AFTER creation
- Component shows stale data from cache

### 3. **Excessive Component Remounting** 🟡
- Modal remounts 3 times in quick succession
- Each remount fetches from stale cache
- Race conditions between save and reload

## Solution 1: Add Cache Invalidation After All Create Operations

### File: `src/components/clients/ClientDetailModal.jsx`

**Line ~991** - After opportunity creation, add:

```javascript
if (savedOpportunity && savedOpportunity.id) {
    // CRITICAL: Invalidate the opportunities cache immediately
    const cacheKey = `opportunities_client_${formData.id}`;
    
    // Try multiple cache invalidation methods
    if (window.api?.clearCache) {
        await window.api.clearCache(cacheKey);
        console.log(`🗑️ Cache cleared: ${cacheKey}`);
    }
    
    if (window.dataManager?.invalidateCache) {
        await window.dataManager.invalidateCache(cacheKey);
        console.log(`🗑️ DataManager cache invalidated: ${cacheKey}`);
    }
    
    // Force immediate reload from database (bypass cache)
    await loadOpportunitiesFromDatabase(formData.id);
    
    console.log('✅ Opportunity created and saved to database:', savedOpportunity.id);
    
    // Rest of the code...
}
```

### Apply Same Pattern to ALL Create Operations:

1. **Contacts** (line ~450)
2. **Sites** (line ~850)
3. **Follow-ups** (line ~550)
4. **Comments** (line ~700)

## Solution 2: Fix Backend Connection Issues

### Check Server Status

```bash
# SSH into server
ssh root@$(cat .droplet_ip)

# Check if Node.js process is running
pm2 status

# Check logs for crashes
pm2 logs --lines 100 | grep -E "(error|crash|ERR_|ECONNREFUSED)"

# Check memory usage
free -h

# Check if database is responsive
psql $DATABASE_URL -c "SELECT COUNT(*) FROM clients;"
```

### Add Connection Pooling Protection

**File: `api/_lib/prisma.js`**

```javascript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = global

// Add connection pool limits
export const prisma = globalForPrisma.prisma || new PrismaClient({
  log: ['error', 'warn'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  // CRITICAL: Prevent connection pool exhaustion
  connection: {
    pool: {
      min: 2,
      max: 10,
      acquireTimeoutMillis: 30000,
      idleTimeoutMillis: 30000
    }
  }
})

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect()
})
```

### Add Request Timeout Protection

**File: `server.js`** - Already has timeout, but verify it's working:

```javascript
// Around line 200 - this should already be there
const timeout = setTimeout(() => {
  if (!res.headersSent) {
    console.error(`⏰ Request timeout for: ${req.method} ${req.url}`)
    res.status(504).json({ 
      error: 'Request timeout', 
      path: req.url,
      timestamp: new Date().toISOString()
    })
  }
}, 30000) // 30 second timeout
```

## Solution 3: Add Retry Logic for Failed API Calls

### Create New File: `src/utils/apiRetry.js`

```javascript
/**
 * Retry API calls that fail with connection errors
 * @param {Function} apiCall - The API function to call
 * @param {number} maxRetries - Maximum number of retries (default: 3)
 * @param {number} delay - Delay between retries in ms (default: 1000)
 */
export async function retryApiCall(apiCall, maxRetries = 3, delay = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`🔄 API call attempt ${attempt}/${maxRetries}`);
            const result = await apiCall();
            console.log(`✅ API call succeeded on attempt ${attempt}`);
            return result;
        } catch (error) {
            lastError = error;
            
            // Only retry on connection errors
            const isConnectionError = 
                error.message?.includes('Failed to fetch') ||
                error.message?.includes('ERR_CONNECTION_REFUSED') ||
                error.message?.includes('ECONNREFUSED') ||
                error.message?.includes('Network request failed');
            
            if (!isConnectionError) {
                // Don't retry non-connection errors
                console.error(`❌ Non-retryable error:`, error);
                throw error;
            }
            
            if (attempt < maxRetries) {
                console.warn(`⚠️ Connection error on attempt ${attempt}, retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                // Exponential backoff
                delay *= 2;
            } else {
                console.error(`❌ All ${maxRetries} retry attempts failed`);
                throw lastError;
            }
        }
    }
    
    throw lastError;
}
```

### Update `ClientDetailModal.jsx` to Use Retry Logic

```javascript
// At the top of the file
import { retryApiCall } from '../../utils/apiRetry';

// Update loadContactsFromDatabase (line ~334)
const loadContactsFromDatabase = async (clientId) => {
    try {
        const token = window.storage?.getToken?.();
        if (!token) {
            console.log('⚠️ No authentication token, skipping contact loading');
            return;
        }
        
        console.log('📡 Loading contacts from database for client:', clientId);
        
        // USE RETRY LOGIC
        const response = await retryApiCall(
            () => window.api.getContacts(clientId),
            3, // max retries
            1000 // initial delay
        );
        
        const contacts = response?.data?.contacts || [];
        
        console.log('✅ Loaded contacts from database:', contacts.length);
        
        setFormData(prevFormData => ({
            ...prevFormData,
            contacts: [...contacts]
        }));
    } catch (error) {
        console.error('❌ Error loading contacts from database after retries:', error);
        // Show user-friendly error
        alert(`Unable to load contacts. Please check your connection and try again.`);
    }
};

// Apply same pattern to loadSitesFromDatabase (line ~364)
const loadSitesFromDatabase = async (clientId) => {
    try {
        const token = window.storage?.getToken?.();
        if (!token) {
            console.log('⚠️ No authentication token, skipping site loading');
            return;
        }
        
        console.log('📡 Loading sites from database for client:', clientId);
        
        // USE RETRY LOGIC
        const response = await retryApiCall(
            () => window.api.getSites(clientId),
            3,
            1000
        );
        
        const sites = response?.data?.sites || [];
        
        console.log('✅ Loaded sites from database:', sites.length);
        
        setFormData(prevFormData => ({
            ...prevFormData,
            sites: [...sites]
        }));
    } catch (error) {
        console.error('❌ Error loading sites from database after retries:', error);
        alert(`Unable to load sites. Please check your connection and try again.`);
    }
};
```

## Solution 4: Prevent Excessive Component Remounting

### Update `ClientDetailModal.jsx` useEffect Dependencies

**Around line 67-80:**

```javascript
// Update formData when client prop changes - but only if user hasn't edited the form
useEffect(() => {
    // Don't reset formData if we're in the middle of auto-saving OR just finished
    if (isAutoSavingRef.current) {
        console.log('⚠️ Skipping formData reset - auto-save in progress');
        return;
    }
    
    if (client) {
        // Only reset formData if:
        // 1. Client ID changed (viewing a different client), OR
        // 2. User hasn't edited the form yet
        const clientIdChanged = client.id !== lastSavedClientId.current;
        
        if (clientIdChanged) {
            // Reset the edit flag when switching to a different client
            hasUserEditedForm.current = false;
            lastSavedClientId.current = client.id;
            
            // ONLY update formData when client actually changes
            setFormData(/* ... */);
        }
    }
}, [client?.id]); // IMPORTANT: Only depend on client.id, not entire client object
```

## Solution 5: Add Comprehensive Logging for Debugging

### Create Debug Script: `debug-persistence.js`

```javascript
// Run this in browser console to diagnose issues

console.log('=== PERSISTENCE DEBUG ===');

// 1. Check cache state
console.log('📦 Cache Contents:');
if (window.api?.cache) {
    console.log('Available cache keys:', Object.keys(window.api.cache));
}

// 2. Check API availability
console.log('🔧 API Methods:', Object.keys(window.api || {}));

// 3. Test opportunity fetch
const testClientId = 'cmh9mhcne0001723xifv2lsqo';
console.log(`🧪 Testing opportunity fetch for client: ${testClientId}`);

window.api.getOpportunitiesByClient(testClientId)
    .then(response => {
        console.log('✅ Opportunities fetched:', response);
        console.log('   Count:', response?.data?.opportunities?.length);
    })
    .catch(error => {
        console.error('❌ Fetch failed:', error);
    });

// 4. Check server connectivity
fetch(window.location.origin + '/api/health')
    .then(r => r.json())
    .then(data => console.log('✅ Server health:', data))
    .catch(e => console.error('❌ Server unreachable:', e));

// 5. Test database connection via API
fetch(window.location.origin + '/api/opportunities')
    .then(r => r.json())
    .then(data => console.log('✅ Opportunities from API:', data))
    .catch(e => console.error('❌ API call failed:', e));
```

## Deployment Steps

1. **Backup Current State**
```bash
git add -A
git commit -m "Before cache invalidation fixes"
git push origin main
```

2. **Apply Changes Locally**
- Create `apiRetry.js`
- Update `ClientDetailModal.jsx` with cache invalidation
- Update `prisma.js` with connection limits
- Test locally

3. **Deploy to Production**
```bash
./quick-deploy.sh
```

4. **Monitor Server Logs**
```bash
ssh root@$(cat .droplet_ip)
pm2 logs --lines 50
```

5. **Test in Production**
- Create an opportunity
- Check console logs for cache invalidation
- Verify opportunity appears immediately
- Check for any ERR_CONNECTION_REFUSED errors

## Testing Checklist

- [ ] Opportunities persist after creation
- [ ] Contacts load without connection errors
- [ ] Sites load without connection errors
- [ ] Cache is invalidated after creates
- [ ] No component remounting loops
- [ ] Server logs show no crashes
- [ ] Memory usage is stable
- [ ] Connection pool not exhausted

## Monitoring Commands

```bash
# Watch server logs in real-time
pm2 logs --lines 0

# Check memory usage
pm2 monit

# Restart if needed
pm2 restart all

# Check database connections
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"
```

## Rollback Plan

If issues persist:

```bash
git reset --hard HEAD~1
./quick-deploy.sh
```

---

**Priority Order:**
1. ✅ Add cache invalidation (immediate fix)
2. ✅ Add retry logic (prevents connection errors)
3. ✅ Fix component remounting (performance)
4. ✅ Check server health (diagnose root cause)
