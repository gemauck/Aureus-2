# Persistence Issues - Fix Summary

## Problems Found

Based on your console logs, three critical issues were identified:

### 1. ❌ **Cache Not Being Invalidated After Creates**
```
✅ Opportunity created and saved to database: cmha5z3c5000lnekso4wjr1qp
✓ Cache hit: opportunities_client_cmh9mhcne0001723xifv2lsqo (age: 12.753s)
✅ Loaded opportunities from database: 0  ← STALE DATA!
```

**Root Cause**: Cache was populated with 0 opportunities BEFORE creation, but never invalidated AFTER creation.

### 2. ❌ **Backend Connection Failures**
```
GET https://abcoafrica.co.za/api/contacts/client/xxx net::ERR_CONNECTION_REFUSED
GET https://abcoafrica.co.za/api/sites/client/xxx net::ERR_CONNECTION_REFUSED
```

**Root Cause**: Server becoming unresponsive or crashing after operations.

### 3. ⚠️  **Excessive Component Remounting**
```
🔄 Setting initial formData from client prop  ← Called 3x times!
📡 Loading opportunities from database        ← Called 3x times!
```

**Root Cause**: useEffect depending on entire `client` object instead of just `client.id`.

## Solutions Provided

### ✅ Solution Files Created:

1. **`CACHE-INVALIDATION-AND-CONNECTION-FIX.md`**
   - Complete technical documentation
   - Root cause analysis
   - Step-by-step fixes
   - Deployment instructions

2. **`src/utils/apiRetry.js`**
   - Automatic retry logic for connection failures
   - Exponential backoff
   - Connection error detection
   - Ready to import and use

3. **`APPLY-THIS-PATCH.md`**
   - Quick reference for exact code changes
   - Line numbers and specific replacements
   - Testing instructions

4. **`diagnose-and-fix.sh`**
   - Automated diagnostic script
   - Checks server health
   - Tests endpoints
   - Monitors resources

5. **`diagnose-database.sql`**
   - SQL queries to verify data persistence
   - Checks JSON fields
   - Validates table structure

## Quick Start - Fix Now

### Step 1: Check Server Health
```bash
chmod +x diagnose-and-fix.sh
./diagnose-and-fix.sh
```

### Step 2: Apply Code Fixes

Edit `src/components/clients/ClientDetailModal.jsx`:

1. **Add import at top:**
   ```javascript
   import { retryApiCall } from '../../utils/apiRetry';
   ```

2. **Add cache invalidation after opportunity create (line ~950):**
   ```javascript
   if (savedOpportunity && savedOpportunity.id) {
       // Invalidate cache
       const cacheKey = `opportunities_client_${formData.id}`;
       if (window.api?.clearCache) {
           await window.api.clearCache(cacheKey);
       }
       
       // Force fresh reload
       await loadOpportunitiesFromDatabase(formData.id);
       // ... rest of code
   }
   ```

3. **Add retry logic to all database loads:**
   ```javascript
   // loadContactsFromDatabase
   const response = await retryApiCall(
       () => window.api.getContacts(clientId),
       3,
       1000
   );
   
   // loadSitesFromDatabase  
   const response = await retryApiCall(
       () => window.api.getSites(clientId),
       3,
       1000
   );
   ```

4. **Fix useEffect dependency (line ~260):**
   ```javascript
   }, [client?.id]); // Only depend on ID
   ```

### Step 3: Deploy
```bash
./quick-deploy.sh
```

### Step 4: Test
1. Open browser console
2. Create an opportunity
3. Look for: `🗑️  Cache cleared: opportunities_client_xxx`
4. Refresh page - opportunity should persist!

## Verification

After deploying, run these checks:

### Browser Console:
```javascript
// 1. Check opportunities persist
window.api.getOpportunitiesByClient('YOUR_CLIENT_ID')
    .then(r => console.log('Count:', r.data.opportunities.length));

// 2. Test cache invalidation
window.api.clearCache('test_key');
console.log('Cache cleared successfully');

// 3. Check server health
fetch('/health').then(r => r.json()).then(console.log);
```

### Server Logs:
```bash
ssh root@$(cat .droplet_ip) "pm2 logs --lines 50"
```

Look for:
- ✅ No `ERR_CONNECTION_REFUSED` errors
- ✅ No crashes or restarts
- ✅ Cache invalidation logs

## Expected Results

### Before Fix:
- ❌ Opportunities don't persist after refresh
- ❌ Connection errors loading contacts/sites
- ⚠️  Component loads data 3x times

### After Fix:
- ✅ Opportunities persist correctly
- ✅ No connection errors
- ✅ Component loads data once
- ✅ Cache invalidates after creates
- ✅ Automatic retries on connection failures

## Files to Review

1. **Quick Reference**: `APPLY-THIS-PATCH.md`
2. **Full Technical Details**: `CACHE-INVALIDATION-AND-CONNECTION-FIX.md`
3. **Diagnostic Tool**: `diagnose-and-fix.sh`
4. **Database Checks**: `diagnose-database.sql`

## Support

If issues persist after applying fixes:

1. Run diagnostic: `./diagnose-and-fix.sh`
2. Check server logs: `pm2 logs`
3. Check database: Run `diagnose-database.sql`
4. Verify code changes match `APPLY-THIS-PATCH.md`

## Rollback

If needed:
```bash
git checkout src/components/clients/ClientDetailModal.jsx
./quick-deploy.sh
```

---

**Priority**: 🔴 CRITICAL - These fixes address data loss and connection failures

**Estimated Time**: 15-30 minutes to apply and test

**Risk Level**: LOW - All changes are additive (retry logic) or fix existing bugs (cache invalidation)
