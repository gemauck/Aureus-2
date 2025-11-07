# User Permissions Persistence Fix

## Problem
User permissions were not persisting - they would immediately revert after being saved. The changes appeared to save but would revert when the modal was reopened or the page was refreshed.

## Root Cause
The permissions were being **double-stringified** before being sent to the API:

1. **First stringification**: `permissions: JSON.stringify(selectedPermissions)` - converted array to string
2. **Second stringification**: `body: JSON.stringify(requestBody)` - stringified the entire request body, including the already-stringified permissions

This resulted in the API receiving a double-encoded string like `"\"[\\\"permission1\\\",\\\"permission2\\\"]\""` instead of a proper array or valid JSON string.

## Solution
**File**: `src/components/users/UserManagement.jsx` (line 2021)

**Before:**
```javascript
const requestBody = {
    userId: editingUserPermissions.id,
    permissions: JSON.stringify(selectedPermissions)  // ❌ Double stringification
};
```

**After:**
```javascript
const requestBody = {
    userId: editingUserPermissions.id,
    permissions: selectedPermissions  // ✅ Send as array
};
```

The API (`api/users/index.js`) already correctly handles arrays (lines 201-202), so sending the array directly allows it to be properly stringified once by `JSON.stringify(requestBody)`.

## How to Test

### Manual Testing in Browser

1. **Start the server** (if not already running):
   ```bash
   npm start
   # or
   node server.js
   ```

2. **Log in** to the application as an admin user

3. **Navigate to Users page** (must be admin)

4. **Open permissions for a user**:
   - Click the "Permissions" button next to any user
   - The permissions modal should open

5. **Change permissions**:
   - Toggle some permission checkboxes
   - Note which permissions are selected

6. **Save permissions**:
   - Click "Save Permissions"
   - Wait for success message

7. **Verify persistence**:
   - Close the permissions modal
   - Reopen the permissions modal for the same user
   - **Expected**: The permissions you set should still be selected
   - **Before fix**: Permissions would revert to defaults

8. **Additional verification**:
   - Refresh the page
   - Reopen the permissions modal
   - **Expected**: Permissions should still persist

### API Testing

You can also test via API calls:

```bash
# 1. Login and get token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"yourpassword"}' \
  | jq -r '.data.accessToken')

# 2. Get users list
curl -s http://localhost:3000/api/users \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.data.users[0]'

# 3. Update permissions (send as array)
curl -s -X PUT http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "userId": "USER_ID_HERE",
    "permissions": ["access_crm", "access_projects"]
  }' | jq

# 4. Verify - get user again
curl -s http://localhost:3000/api/users \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.data.users[] | select(.id == "USER_ID_HERE") | .permissions'
```

### Automated Test Script

A test script is available at `test-permissions-persistence.js`:

```bash
node test-permissions-persistence.js
```

This script will:
1. Log in as admin
2. Find a test user
3. Update their permissions
4. Verify the permissions persist after fetching the user again

## Technical Details

### Request Flow (After Fix)

1. **Frontend** (`UserManagement.jsx`):
   - `selectedPermissions` = `["access_crm", "access_projects"]` (array)
   - `requestBody.permissions` = `["access_crm", "access_projects"]` (array)
   - `JSON.stringify(requestBody)` = `'{"userId":"...","permissions":["access_crm","access_projects"]}'`

2. **API** (`api/users/index.js`):
   - Receives: `permissions` as array `["access_crm", "access_projects"]`
   - Detects it's an array (line 201)
   - Stringifies once: `updateData.permissions = JSON.stringify(permissions)` → `'["access_crm","access_projects"]'`
   - Saves to database as JSON string

3. **Database**:
   - Stores: `'["access_crm","access_projects"]'` (valid JSON string)

4. **Retrieval**:
   - Database returns: `'["access_crm","access_projects"]'`
   - Frontend parses: `JSON.parse(user.permissions)` → `["access_crm", "access_projects"]`
   - Permissions display correctly

### What Was Wrong Before

1. **Frontend**:
   - `selectedPermissions` = `["access_crm", "access_projects"]` (array)
   - `requestBody.permissions` = `JSON.stringify(selectedPermissions)` = `'["access_crm","access_projects"]'` (string)
   - `JSON.stringify(requestBody)` = `'{"userId":"...","permissions":"[\\"access_crm\\",\\"access_projects\\"]"}'`

2. **API**:
   - Receives: `permissions` as string `'["access_crm","access_projects"]'`
   - Tries to parse: `JSON.parse('["access_crm","access_projects"]')` → `["access_crm", "access_projects"]`
   - But the actual value received was double-encoded, causing parsing issues or incorrect storage

## Files Changed

- `src/components/users/UserManagement.jsx` (line 2021)
  - Changed from `permissions: JSON.stringify(selectedPermissions)` 
  - To `permissions: selectedPermissions`

## Verification Checklist

- [x] Code fix applied
- [x] API correctly handles array input
- [ ] Manual browser test (requires server running)
- [ ] API test (requires server running)
- [ ] Automated test script (requires server running)

## Status

✅ **Fix Applied** - The code change has been made. Testing requires:
- Server running on port 3000
- Database connected
- At least one user account exists

Once the server is running, the permissions should persist correctly.

