# Phase 6 Browser Testing Guide

## Test: Create Client with Normalized Data

### Step 1: Login to Application
1. Navigate to: `https://abcoafrica.co.za/`
2. Login with your credentials
3. Navigate to **Clients** section

### Step 2: Create Test Client
1. Click **"New Client"** or **"+"** button
2. Fill in basic information:
   - Name: `Test Phase6 Client - [Current Date]`
   - Industry: Any
   - Status: Active
   - Click **Save**

### Step 3: Test Sites
1. Open the newly created client
2. Navigate to **"Sites"** tab
3. Click **"Add Site"** or **"+"**
4. Fill in:
   - Name: `Test Site 1`
   - Address: `123 Test Street`
   - Contact Person: `John Doe`
   - Contact Phone: `1234567890`
   - Contact Email: `test@example.com`
5. Click **Save**
6. **Verify:**
   - Site appears in the list
   - Site data persists after page refresh
   - No duplicate sites appear

### Step 4: Test Contracts
1. Navigate to **"Contracts"** tab (Admin only)
2. Click **"Add Contract"** or **"+"**
3. Fill in:
   - Name: `Test Contract 1`
   - Type: `Service Agreement`
   - Upload a test file if available
4. Click **Save**
5. **Verify:**
   - Contract appears in the list
   - Contract data persists after page refresh
   - No duplicate contracts appear

### Step 5: Test Proposals
1. Navigate to **"Proposals"** tab (if available)
2. Click **"Add Proposal"** or **"+"**
3. Fill in:
   - Title: `Test Proposal 1`
   - Amount: `10000`
   - Status: `Pending`
4. Click **Save**
5. **Verify:**
   - Proposal appears in the list
   - Proposal data persists after page refresh
   - No duplicate proposals appear

### Step 6: Test FollowUps
1. Navigate to **"Follow-ups"** or **"Activities"** tab
2. Click **"Add Follow-up"** or **"+"**
3. Fill in:
   - Date: Today's date
   - Time: Current time
   - Type: `Call`
   - Description: `Test Follow-up`
4. Click **Save**
5. **Verify:**
   - Follow-up appears in the list
   - Follow-up data persists after page refresh
   - No duplicate follow-ups appear

### Step 7: Test Services
1. Navigate to **"Services"** tab (if available)
2. Click **"Add Service"** or **"+"**
3. Fill in:
   - Name: `Test Service 1`
   - Description: `Test service description`
   - Price: `500`
   - Status: `Active`
4. Click **Save**
5. **Verify:**
   - Service appears in the list
   - Service data persists after page refresh
   - No duplicate services appear

### Step 8: Verify No Duplication
1. **Refresh the page** multiple times
2. **Check each tab** (Sites, Contracts, Proposals, FollowUps, Services)
3. **Verify:**
   - Each item appears only once
   - Data is correctly displayed
   - No duplicate entries in any list

### Step 9: Test Updates
1. Edit a site (click edit/pencil icon)
2. Change the address to `456 Updated Street`
3. Save changes
4. **Verify:**
   - Changes are saved
   - Updated data persists after refresh
   - No duplicates created

### Step 10: Test Deletion
1. Delete one of the test items (site, contract, etc.)
2. **Verify:**
   - Item is removed from the list
   - Item does not reappear after refresh
   - No duplicate items remain

## Expected Results

### ✅ Success Indicators:
- All items create successfully
- Data persists after page refresh
- No duplicate entries appear
- Updates work correctly
- Deletions work correctly
- UI shows correct data from normalized tables

### ❌ Failure Indicators:
- Items appear twice in lists
- Data doesn't persist after refresh
- Console errors related to normalized tables
- API errors when creating/updating/deleting

## What to Check in Browser Console

1. Open Developer Tools (F12)
2. Go to **Console** tab
3. Look for:
   - ✅ No errors related to `ClientSite`, `ClientContract`, etc.
   - ✅ Successful API responses
   - ⚠️ Warnings about data in both JSON and normalized tables (expected, harmless)

## What to Check in Network Tab

1. Open Developer Tools (F12)
2. Go to **Network** tab
3. Filter by **XHR** or **Fetch**
4. Check API calls:
   - `/api/clients` - Should return normalized data
   - `/api/clients/[id]` - Should include normalized tables in response
   - `/api/sites/client/[id]` - Should return sites from normalized table

## Test Script

After completing the browser test, run this verification script:

```bash
node test-phase6-normalized-tables.js
```

This will verify:
- Data was created in normalized tables
- No JSON writes occurred
- No duplicates exist
- Data persists correctly

## Report Issues

If you find any issues, note:
1. **What action** caused the issue
2. **What you expected** vs **what happened**
3. **Browser console errors** (if any)
4. **Network tab** API responses (if relevant)
5. **Screenshots** of the issue
















