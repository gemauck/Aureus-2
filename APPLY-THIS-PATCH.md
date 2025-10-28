# CRITICAL CACHE INVALIDATION PATCH
Apply these changes to ClientDetailModal.jsx

## Summary
This patch fixes three critical issues:
1. Cache not being invalidated after creating opportunities/contacts/sites
2. Connection refused errors when loading contacts/sites
3. Excessive component remounting causing stale data

## Prerequisites
1. Ensure `src/utils/apiRetry.js` exists (already created)
2. Backup current ClientDetailModal.jsx before editing

## Changes Required

### Change 1: Add Import (Top of file, after React imports)

```javascript
// Add this import
import { retryApiCall } from '../../utils/apiRetry';
```

### Change 2: Fix Opportunity Cache Invalidation (Line ~950)

Find the section after `if (savedOpportunity && savedOpportunity.id) {`

Replace the existing cache invalidation code with:

```javascript
// CRITICAL: Invalidate cache IMMEDIATELY after creation
const cacheKey = `opportunities_client_${formData.id}`;

if (window.api?.clearCache) {
    await window.api.clearCache(cacheKey);
    console.log(`🗑️  Cache cleared: ${cacheKey}`);
}

// Force fresh reload
const oppResponse = await retryApiCall(
    () => window.api.getOpportunitiesByClient(formData.id),
    3,
    1000
);

const freshOpportunities = oppResponse?.data?.opportunities || [];
console.log(`✅ Reloaded ${freshOpportunities.length} opportunities`);

setFormData(prev => ({
    ...prev,
    opportunities: freshOpportunities
}));
```

### Change 3: Add Retry to loadContactsFromDatabase (Line ~340)

Replace:
```javascript
const response = await window.api.getContacts(clientId);
```

With:
```javascript
const response = await retryApiCall(
    () => window.api.getContacts(clientId),
    3,
    1000
);
```

### Change 4: Add Retry to loadSitesFromDatabase (Line ~370)

Replace:
```javascript
const response = await window.api.getSites(clientId);
```

With:
```javascript
const response = await retryApiCall(
    () => window.api.getSites(clientId),
    3,
    1000
);
```

### Change 5: Fix loadOpportunitiesFromDatabase (Line ~400)

Add cache invalidation BEFORE loading:

```javascript
// Invalidate cache before loading
const cacheKey = `opportunities_client_${clientId}`;
if (window.api?.clearCache) {
    await window.api.clearCache(cacheKey);
}

const response = await retryApiCall(
    () => window.api.getOpportunitiesByClient(clientId),
    3,
    1000
);
```

### Change 6: Fix useEffect Dependency (Line ~260)

Replace:
```javascript
}, [client]);
```

With:
```javascript
}, [client?.id]);
```

## Testing

1. Deploy changes: `./quick-deploy.sh`
2. Open browser console
3. Create an opportunity
4. Look for these logs:
   - `🗑️  Cache cleared: opportunities_client_xxx`
   - `✅ Reloaded X opportunities`
5. Refresh page - opportunity should persist

## Verification Script

Run in browser console after creating opportunity:

```javascript
// Check if cache was cleared
console.log('Cache keys:', Object.keys(window.api?.cache || {}));

// Check opportunities
window.api.getOpportunitiesByClient('YOUR_CLIENT_ID')
    .then(r => console.log('Opportunities:', r.data.opportunities.length));
```

## Rollback

If issues occur:
```bash
git checkout src/components/clients/ClientDetailModal.jsx
./quick-deploy.sh
```
