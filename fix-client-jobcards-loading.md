# Fix for Client Service & Maintenance Job Cards Loading

## Problem
When viewing a client's Service & Maintenance tab, job cards show "0 job cards" and "Loading job cards..." indefinitely, even though job cards exist for that client.

## Root Cause Analysis

Based on the code review, there are several potential issues:

### 1. Client ID Type Mismatch
The `loadJobCards` function converts `client.id` to a string with `String(client.id)`, but the API filter uses exact match. If the client ID in job cards was stored as a different format (e.g., number vs string), they won't match.

### 2. Fallback Search Not Working
When clientId search returns no results, the fallback tries `clientName` search. However, if the name has variations (e.g., "AccuFarm" vs "AccuFarm (Pty) Ltd"), the partial match might not work correctly.

### 3. React Error #300
The console shows "Minified React error #300" which indicates a component rendering issue. This could be preventing the job cards from displaying even if they load.

## Solution

### Step 1: Run the Debug Script
First, let's verify what's in the database:

```bash
cd /Users/gemau/Documents/Project\ ERP/abcotronics-erp-modular
node debug-jobcards-accufarm.js
```

### Step 2: Fix the loadJobCards function

The improved version should:
1. Try clientId first (most reliable)
2. Try clientName with flexible matching
3. Fall back to fetching all and filtering client-side

Here's the improved implementation:

```javascript
const loadJobCards = useCallback(async () => {
    if (!client?.id) {
        setJobCards([]);
        return;
    }
    
    setLoadingJobCards(true);
    try {
        const token = window.storage?.getToken?.();
        if (!token) {
            setLoadingJobCards(false);
            return;
        }
        
        const clientIdToMatch = String(client.id);
        const normalizedClientName = (client.name || '').trim().toLowerCase();
        
        console.log('🔍 Loading job cards for client:', {
            clientId: clientIdToMatch,
            clientName: client.name,
            normalizedName: normalizedClientName
        });
        
        // Strategy 1: Try by clientId
        let jobCardsResult = [];
        try {
            const response = await fetch(`/api/jobcards?clientId=${encodeURIComponent(clientIdToMatch)}&pageSize=1000`, {
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                jobCardsResult = data.jobCards || [];
                console.log(`📋 Found ${jobCardsResult.length} job cards by clientId`);
            }
        } catch (e) {
            console.warn('Strategy 1 (clientId) failed:', e);
        }
        
        // Strategy 2: If no results, try by clientName
        if (jobCardsResult.length === 0 && client.name) {
            try {
                const response = await fetch(`/api/jobcards?clientName=${encodeURIComponent(client.name)}&pageSize=1000`, {
                    headers: { 
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    jobCardsResult = data.jobCards || [];
                    console.log(`📋 Found ${jobCardsResult.length} job cards by clientName`);
                }
            } catch (e) {
                console.warn('Strategy 2 (clientName) failed:', e);
            }
        }
        
        // Strategy 3: If still no results, fetch all and filter client-side
        if (jobCardsResult.length === 0) {
            console.log('📡 Strategy 3: Fetching all job cards and filtering client-side...');
            try {
                const response = await fetch(`/api/jobcards?pageSize=5000`, {
                    headers: { 
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    const allJobCards = data.jobCards || [];
                    console.log(`📋 Fetched ${allJobCards.length} total job cards`);
                    
                    // Extract base name for flexible matching
                    const baseName = normalizedClientName
                        .replace(/\s*\(pty\)\s*ltd\.?/gi, '')
                        .replace(/\s*ltd\.?/gi, '')
                        .replace(/\s*inc\.?/gi, '')
                        .trim();
                    
                    // Filter with flexible matching
                    jobCardsResult = allJobCards.filter(jc => {
                        // 1. Exact clientId match
                        if (jc.clientId === clientIdToMatch) return true;
                        
                        // 2. Normalize job card client name
                        const jcClientName = (jc.clientName || '').trim().toLowerCase();
                        
                        // 3. Exact name match
                        if (jcClientName === normalizedClientName) return true;
                        
                        // 4. Base name match
                        if (baseName && baseName.length >= 3) {
                            const jcBaseName = jcClientName
                                .replace(/\s*\(pty\)\s*ltd\.?/gi, '')
                                .replace(/\s*ltd\.?/gi, '')
                                .replace(/\s*inc\.?/gi, '')
                                .trim();
                            
                            if (jcBaseName === baseName) return true;
                        }
                        
                        // 5. Substring matches (min 5 chars to avoid false positives)
                        if (normalizedClientName.length >= 5 && jcClientName.includes(normalizedClientName)) return true;
                        if (jcClientName.length >= 5 && normalizedClientName.includes(jcClientName)) return true;
                        if (baseName && baseName.length >= 5 && jcClientName.includes(baseName)) return true;
                        
                        return false;
                    });
                    
                    console.log(`✅ Filtered to ${jobCardsResult.length} matching job cards`);
                }
            } catch (e) {
                console.error('Strategy 3 (all + filter) failed:', e);
            }
        }
        
        setJobCards(jobCardsResult);
        
    } catch (error) {
        console.error('Error loading job cards:', error);
        setJobCards([]);
    } finally {
        setLoadingJobCards(false);
    }
}, [client?.id, client?.name]);
```

### Step 3: Fix React Error #300

React Error #300 typically means "Invalid hook call". Check that:
1. All hooks are called at the top level of the component
2. No hooks are called conditionally
3. The component is properly mounted

### Step 4: Verify Job Cards Have ClientId Set

Run this SQL to check if job cards have clientId properly set:

```sql
SELECT 
    jc."jobCardNumber",
    jc."clientId",
    jc."clientName",
    c.id as "matchingClientId",
    c.name as "matchingClientName"
FROM "JobCard" jc
LEFT JOIN "Client" c ON jc."clientId" = c.id OR LOWER(jc."clientName") LIKE '%' || LOWER(c.name) || '%'
WHERE jc."clientName" ILIKE '%AccuFarm%'
ORDER BY jc."createdAt" DESC;
```

## Quick Fix

If you want a quick fix, update the job cards' `clientId` field to match the actual client ID:

```sql
-- First, find the AccuFarm client ID
SELECT id, name FROM "Client" WHERE name ILIKE '%AccuFarm%';

-- Then update job cards (replace 'actual-client-id' with the ID from above)
UPDATE "JobCard" 
SET "clientId" = 'actual-client-id'
WHERE "clientName" ILIKE '%AccuFarm%' AND ("clientId" IS NULL OR "clientId" = '');
```

