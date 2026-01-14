# Frontend Overwrite Prevention Testing Guide

## Overview

This guide outlines the best tests to ensure frontend functionality doesn't cause data overwrites when saving. These tests focus on detecting common bugs that cause data loss.

## Critical Test Scenarios

### 1. **Partial Field Updates** ⚠️ MOST COMMON BUG

**Scenario:** User edits only the client name, but frontend sends only that field.

**Test:**
```javascript
// Setup: Client has name, notes, contacts, comments
// Action: Update ONLY name via frontend
// Verify: Notes, contacts, comments are NOT lost
```

**What to check:**
- ✅ Notes field preserved
- ✅ Contacts preserved (from normalized table)
- ✅ Comments preserved (from normalized table)
- ✅ Other fields (address, website, etc.) preserved

**How to test in browser:**
1. Open existing client
2. Change ONLY the client name
3. Save
4. Refresh page
5. Verify notes, contacts, comments still exist

---

### 2. **Concurrent Saves / Race Conditions**

**Scenario:** User clicks save twice quickly, or multiple tabs open.

**Test:**
```javascript
// Setup: Client with initial data
// Action: Two saves happen simultaneously (simulate with Promise.all)
// Verify: Both updates apply correctly without overwriting each other
```

**What to check:**
- ✅ Last update wins for conflicting fields (expected behavior)
- ✅ No data loss (fields not in conflict preserved)
- ✅ No duplicate records created
- ✅ Contacts/comments not affected by race condition

**How to test in browser:**
1. Open client in two tabs
2. Edit different fields in each tab
3. Save both simultaneously
4. Refresh both tabs
5. Verify both changes persisted (or last save won)

---

### 3. **Stale Data Overwrites**

**Scenario:** User loads client, server data changes, user saves → overwrites server changes.

**Test:**
```javascript
// Setup: 
// 1. Load client (has contacts A, B)
// 2. Server adds contact C (via another user/process)
// 3. Frontend saves with contacts A, B (doesn't know about C)
// Verify: Contact C is NOT lost
```

**What to check:**
- ✅ Server-side changes not overwritten
- ✅ Frontend merges local + server data correctly
- ✅ Optimistic updates don't cause conflicts

**How to test:**
1. Open client modal
2. Add contact via API directly (simulate another user)
3. In frontend, edit client name
4. Save from frontend
5. Verify the contact added via API still exists

---

### 4. **Empty Array Overwrites** ⚠️ CRITICAL BUG

**Scenario:** Frontend sends `contacts: []` when user hasn't touched contacts field.

**Test:**
```javascript
// Setup: Client has 3 contacts
// Action: Frontend sends update with contacts: [] or contacts: undefined
// Verify: Contacts are NOT cleared
```

**What to check:**
- ✅ Empty array doesn't clear existing contacts
- ✅ Undefined doesn't clear contacts
- ✅ Contacts endpoint handles this correctly

**How to test:**
1. Client has existing contacts
2. Edit ONLY notes field
3. Inspect network request - verify contacts not sent OR sent as existing array
4. Save
5. Verify contacts still exist

---

### 5. **Optimistic Update Conflicts**

**Scenario:** Optimistic UI update shows changes, but server rejects → data inconsistency.

**Test:**
```javascript
// Setup: 
// 1. Make optimistic update (UI shows change immediately)
// 2. Server update fails or returns different data
// 3. Frontend merges server response
// Verify: No data loss, UI reflects actual server state
```

**What to check:**
- ✅ Failed saves don't corrupt local state
- ✅ Server response correctly merged with local changes
- ✅ User can see what actually saved vs. what they typed

**How to test:**
1. Open client
2. Make changes (should show optimistically)
3. Disconnect network (simulate failure)
4. Save should fail
5. Reconnect - verify original data restored

---

### 6. **State Merge Issues** ⚠️ COMMON BUG

**Scenario:** Frontend merges API response incorrectly, losing local changes.

**Test:**
```javascript
// Frontend code to check:
const savedClient = apiResponse?.data?.client || apiResponse?.client || comprehensiveClient;
const finalClient = { ...savedClient, ...comprehensiveClient };
// Verify: comprehensiveClient (local) overrides server for user's latest input
```

**What to check:**
- ✅ Latest user input preserved (comprehensiveClient)
- ✅ Server response merged correctly
- ✅ Notes field especially preserved (often lost)

**Code pattern to verify:**
```javascript
// GOOD: Merge local over server
const finalClient = { ...savedClient, ...comprehensiveClient };

// BAD: Server overwrites local
const finalClient = { ...comprehensiveClient, ...savedClient };
```

---

### 7. **Contacts/Comments Separate Management**

**Scenario:** Updating client shouldn't affect contacts/comments.

**Test:**
```javascript
// Setup: Client with contacts and comments
// Action: Update client name, industry, notes
// Verify: Contacts and comments unchanged
```

**What to check:**
- ✅ Contacts managed via `/api/contacts` endpoint (separate)
- ✅ Comments managed via normalized table (separate)
- ✅ Client update doesn't touch contacts/comments tables

**How to test:**
1. Client has 3 contacts, 2 comments
2. Edit client name only
3. Save
4. Verify contacts and comments count unchanged
5. Verify contact data unchanged

---

### 8. **Multiple Tab Conflicts**

**Scenario:** User has same client open in multiple tabs, saves from both.

**Test:**
```javascript
// Setup: Open client in Tab A and Tab B
// Action: 
//   - Tab A: Edit name
//   - Tab B: Edit notes  
//   - Save both
// Verify: Both changes saved, no data loss
```

**What to check:**
- ✅ Last save wins for conflicting fields
- ✅ Non-conflicting fields from both saves preserved
- ✅ No duplicate records
- ✅ Cache invalidation works correctly

---

### 9. **Auto-save Conflicts**

**Scenario:** Auto-save triggers while user is typing, overwrites their input.

**Test:**
```javascript
// Setup: Auto-save every 5 seconds
// Action: User typing in notes field
// Auto-save triggers with old notes value
// Verify: User's current typing not lost
```

**What to check:**
- ✅ Auto-save doesn't trigger while user editing
- ✅ Debouncing works correctly
- ✅ User's latest input always saved

---

### 10. **Undefined/Null Handling**

**Scenario:** Frontend sends `undefined` or `null` for fields, clearing them.

**Test:**
```javascript
// Setup: Client has notes: "Important note"
// Action: Frontend sends { name: "New Name", notes: undefined }
// Verify: Notes field NOT cleared to null/empty
```

**What to check:**
- ✅ Undefined fields not sent to API
- ✅ Null fields handled correctly
- ✅ Default values used when needed

---

## Recommended Test Checklist

### For Each Save Operation:

- [ ] **Partial Update Test**: Update one field, verify others preserved
- [ ] **Empty Array Test**: Verify empty arrays don't clear data
- [ ] **Undefined Test**: Verify undefined doesn't clear fields
- [ ] **Contacts Test**: Verify contacts preserved/updated correctly
- [ ] **Comments Test**: Verify comments preserved/updated correctly
- [ ] **Refresh Test**: Save, refresh page, verify data persisted
- [ ] **Network Tab Test**: Inspect API request, verify correct data sent
- [ ] **Console Test**: Check for errors/warnings in browser console

### Browser Testing Steps:

1. **Test Partial Updates:**
   ```
   - Open client with existing data
   - Change ONLY client name
   - Save
   - Refresh
   - Verify: Notes, contacts, comments still there
   ```

2. **Test Contacts:**
   ```
   - Client with 2 contacts
   - Edit ONLY notes field
   - Save
   - Verify: Both contacts still exist
   ```

3. **Test Comments:**
   ```
   - Client with comments
   - Update client name
   - Save
   - Verify: Comments still exist
   ```

4. **Test Network Request:**
   ```
   - Open DevTools → Network tab
   - Edit client
   - Save
   - Inspect PUT /api/clients/:id request
   - Verify: All fields present OR only changed fields (if safe)
   ```

5. **Test State After Save:**
   ```
   - Edit client
   - Save
   - Check React DevTools state
   - Verify: State matches database
   ```

## Code Patterns to Verify

### ✅ GOOD: Preserve All Fields
```javascript
// Frontend should send comprehensiveClient with ALL fields
const comprehensiveClient = {
  ...existingClient,
  ...formData,  // User's changes
  // Explicitly include all fields
  contacts: formData.contacts || existingClient.contacts || [],
  comments: formData.comments || existingClient.comments || [],
  // etc.
}
```

### ✅ GOOD: Merge Local Over Server
```javascript
// After API response, merge local changes over server
const finalClient = { 
  ...apiResponse.client,  // Server data
  ...comprehensiveClient  // User's latest input (wins)
}
```

### ❌ BAD: Partial Update That Clears Fields
```javascript
// Don't do this - might clear other fields
await api.updateClient(id, { name: newName })
// Missing other fields - could clear notes, etc.
```

### ❌ BAD: Server Overwrites Local
```javascript
// Don't do this - server might have stale data
const finalClient = { 
  ...comprehensiveClient,  // User's input
  ...apiResponse.client    // Server data (might overwrite)
}
```

## Automated Test Recommendations

1. **Unit Tests:**
   - Test `handleSaveClient` function with partial data
   - Test merge logic: `{ ...server, ...local }`
   - Test empty array handling

2. **Integration Tests:**
   - Test full save flow: edit → save → verify
   - Test concurrent saves
   - Test error recovery

3. **E2E Tests (Browser):**
   - Use Playwright/Cypress to test real user flows
   - Test partial updates
   - Test multiple tabs
   - Test network failures

## Current Code Status

Based on code review:
- ✅ **Safe:** Prisma updates only touch provided fields
- ✅ **Safe:** Contacts/Comments in separate tables (can't be accidentally cleared)
- ⚠️ **Review:** Frontend merge logic `{ ...savedClient, ...comprehensiveClient }`
- ⚠️ **Review:** Ensure comprehensiveClient has ALL fields before saving

## Test Scripts Created

1. `test-frontend-overwrite-scenarios.js` - Database-level overwrite tests
2. `test-all-client-endpoints.js` - Comprehensive endpoint tests
3. `test-contact-22-migration.js` - Migration test

## Next Steps

1. Run `test-frontend-overwrite-scenarios.js` ✅ (passed)
2. Manual browser testing following checklist above
3. Verify network requests in DevTools
4. Add E2E tests for critical save flows
5. Review frontend merge logic in `handleSaveClient`








