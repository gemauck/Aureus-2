# Fix Client Data - Instructions

## Problem
Client `cmhdajkei000bm8zlnz01j7hb` (Chromex Mining Company) is causing 500 errors when:
- Loading client details
- Loading client groups
- Creating sites

## Solution

### Option 1: Use the API Fix Endpoint (Recommended)

Open your browser console on the application and run:

```javascript
// Step 1: Diagnose the issue
fetch('/api/clients/cmhdajkei000bm8zlnz01j7hb/fix', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${window.storage?.getToken?.()}`
  },
  credentials: 'include',
  body: JSON.stringify({ action: 'diagnose' })
})
.then(r => r.json())
.then(data => {
  console.log('Diagnosis:', data);
  return data;
})
.then(data => {
  // Step 2: Run full fix
  return fetch('/api/clients/cmhdajkei000bm8zlnz01j7hb/fix', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${window.storage?.getToken?.()}`
    },
    credentials: 'include',
    body: JSON.stringify({ action: 'full-fix' })
  });
})
.then(r => r.json())
.then(data => {
  console.log('Fix Results:', data);
  alert('✅ Fix completed! Check console for details.');
});
```

### Option 2: Use the Node.js Script

```bash
# Diagnose first
node fix-client-data.js cmhdajkei000bm8zlnz01j7hb diagnose

# Run full fix
node fix-client-data.js cmhdajkei000bm8zlnz01j7hb full-fix
```

### Option 3: Use cURL

```bash
# Get your auth token first, then:
TOKEN="your-auth-token-here"

# Diagnose
curl -X POST "https://abcoafrica.co.za/api/clients/cmhdajkei000bm8zlnz01j7hb/fix" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"diagnose"}'

# Run full fix
curl -X POST "https://abcoafrica.co.za/api/clients/cmhdajkei000bm8zlnz01j7hb/fix" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"full-fix"}'
```

## What the Fix Does

1. **Diagnoses** the issue:
   - Checks if client exists
   - Finds orphaned group memberships (groupId references non-existent groups)
   - Validates JSON fields (contacts, sites, comments, etc.)

2. **Cleans up orphaned memberships**:
   - Deletes `ClientCompanyGroup` records where the group doesn't exist

3. **Fixes invalid JSON fields**:
   - Replaces corrupted JSON strings with valid empty arrays/objects
   - Sets null fields to proper defaults

4. **Verifies** the fix worked

## After Running the Fix

1. Refresh the page
2. Try opening the client again
3. The 500 errors should be resolved
4. You should be able to:
   - View client details
   - View/assign groups
   - Add sites

## If Issues Persist

Check the server logs for detailed error messages. The improved error handling will now show more specific information about what's failing.

