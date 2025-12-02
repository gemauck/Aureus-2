# Company Groups Feature - Testing Guide

## Testing Checklist

### 1. Basic Functionality Tests

#### ✅ Test: Access Groups Tab
- [ ] Navigate to a client detail page
- [ ] Click on the "Groups" tab
- [ ] Verify the Groups tab content loads
- [ ] Check browser console for any errors

#### ✅ Test: Add Group Button
- [ ] Click the "Add Group" button
- [ ] Verify the modal opens (should appear with z-index 9999)
- [ ] Check browser console for log: "Add Group button clicked"
- [ ] Verify modal has a close button (X) in the header
- [ ] Verify modal backdrop is clickable to close

#### ✅ Test: Group Selection
- [ ] In the modal, verify dropdown shows available groups
- [ ] Select a group from the dropdown
- [ ] Verify "Add" button becomes enabled when a group is selected
- [ ] Check console for log: "Group selected: [groupId]"

#### ✅ Test: Add Client to Group
- [ ] Select a group and click "Add"
- [ ] Verify loading state appears (if any)
- [ ] Check browser console for logs:
  - "Adding client to group: {clientId, groupId}"
  - "Add group response: {status, data}"
  - "✅ Group added successfully"
- [ ] Verify modal closes after successful addition
- [ ] Verify the group appears in "Additional Group Memberships" list
- [ ] Verify success message appears

#### ✅ Test: Persistence
- [ ] Add a client to a group
- [ ] Close the client detail modal
- [ ] Reopen the same client
- [ ] Navigate to Groups tab
- [ ] Verify the group membership is still there
- [ ] **CRITICAL**: Refresh the browser page
- [ ] Reopen the client and check Groups tab
- [ ] Verify the group membership persists after page refresh

#### ✅ Test: Remove from Group
- [ ] Click "Remove" button next to a group membership
- [ ] Confirm the removal dialog
- [ ] Verify the group disappears from the list
- [ ] Verify the group appears back in available groups dropdown

### 2. Edge Cases

#### ✅ Test: Primary Parent vs Group Membership
- [ ] Set a primary parent company
- [ ] Verify that company doesn't appear in "Add Group" dropdown
- [ ] Add a different company to groups
- [ ] Verify primary parent and group memberships are separate

#### ✅ Test: No Available Groups
- [ ] Create a scenario where all clients are already in groups
- [ ] Click "Add Group" button
- [ ] Verify modal opens and shows message: "No groups available to add..."
- [ ] Verify button is still clickable

#### ✅ Test: Empty Groups List
- [ ] Navigate to a client with no existing groups
- [ ] Verify "No additional group memberships" message appears
- [ ] Verify "Add Group" button is still functional

### 3. Error Handling Tests

#### ✅ Test: Network Error
- [ ] Disconnect internet (or use browser dev tools to block network)
- [ ] Try to add a group
- [ ] Verify error message appears
- [ ] Verify modal doesn't close on error

#### ✅ Test: Duplicate Group
- [ ] Add client to a group
- [ ] Try to add the same client to the same group again
- [ ] Verify error message: "Client is already a member of this group"
- [ ] Verify modal stays open

#### ✅ Test: Invalid Group
- [ ] Use browser dev tools to modify request
- [ ] Send invalid groupId
- [ ] Verify appropriate error message appears

### 4. UI/UX Tests

#### ✅ Test: Modal Display
- [ ] Verify modal appears centered on screen
- [ ] Verify backdrop has semi-transparent black overlay
- [ ] Verify modal content is readable
- [ ] Verify close button (X) is visible and clickable

#### ✅ Test: Responsive Design
- [ ] Test on desktop browser
- [ ] Test on mobile/tablet viewport (resize browser)
- [ ] Verify modal is still usable on smaller screens

#### ✅ Test: Loading States
- [ ] Verify loading indicator appears when fetching groups
- [ ] Verify loading indicator appears when adding group
- [ ] Verify UI doesn't freeze during operations

### 5. API Tests (Browser Console)

Open browser console and check for:

#### ✅ Console Logs
```javascript
// When clicking Add Group button:
"Add Group button clicked" { allGroupsCount, primaryParentId, ... }

// When selecting a group:
"Group selected: [groupId]"

// When adding:
"Adding client to group: {clientId, groupId}"
"Add group response: {status, statusText, data}"
"✅ Group added successfully: {...}"
"Reloaded groups data: {...}"

// On server side (check server logs):
"POST /api/clients/:id/groups - clientId: ..."
"POST body: {groupId, role}"
"Creating membership: {...}"
"✅ Membership created successfully: {...}"
```

#### ✅ Network Requests
- [ ] Check Network tab in browser dev tools
- [ ] Verify POST request to `/api/clients/[id]/groups` returns 201 (Created)
- [ ] Verify GET request to `/api/clients/[id]/groups` returns 200 (OK)
- [ ] Check request/response payloads are correct

### 6. Database Verification

#### ✅ Test: Database Persistence
1. Add a client to a group via UI
2. Connect to PostgreSQL database
3. Run query:
   ```sql
   SELECT * FROM "ClientCompanyGroup" 
   WHERE "clientId" = '[your-client-id]' 
   ORDER BY "createdAt" DESC;
   ```
4. Verify the membership record exists
5. Verify fields are correct (clientId, groupId, role, timestamps)

## Known Issues Fixed

- ✅ Route mapping added to server.js for `/api/clients/:id/groups`
- ✅ Button disabled state removed (now always enabled when client exists)
- ✅ Modal z-index increased to 9999
- ✅ Close button added to modal
- ✅ Better error handling and logging added
- ✅ Persistence improvements with database commit delay

## Quick Test Commands

### Check if modal opens (Browser Console):
```javascript
// In browser console on client detail page:
document.querySelector('[class*="z-[9999]"]') 
// Should return the modal element when open
```

### Check groups data (Browser Console):
```javascript
// After opening Groups tab:
console.log('All Groups:', window.allGroups);
console.log('Group Memberships:', window.groupMemberships);
```

## Reporting Issues

If you find any issues, please note:
1. Browser and version
2. Steps to reproduce
3. Expected vs actual behavior
4. Console errors (if any)
5. Network request/response (from Network tab)
6. Server logs (if available)

