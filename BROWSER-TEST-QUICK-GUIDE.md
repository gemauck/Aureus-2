# Quick Browser Test Guide - Phase 6

## 🎯 Quick Test Steps

### 1. Login & Navigate
- Go to: `https://abcoafrica.co.za/`
- Login with your credentials
- Click on **Clients** in the menu

### 2. Create Test Client
1. Click **"New Client"** button
2. Enter: `Test Phase6 - [Your Name]`
3. Fill in required fields (Industry, Status, etc.)
4. Click **Save**

### 3. Test Sites (5 minutes)
1. Open the client you just created
2. Go to **"Sites"** tab
3. Click **"Add Site"**
4. Fill in:
   - Name: `Test Site 1`
   - Address: `123 Test St`
   - Contact: `Test Contact`
5. Click **Save**
6. ✅ **Check:** Site appears once, persists after refresh

### 4. Test Contracts (2 minutes - Admin only)
1. Go to **"Contracts"** tab
2. Add a test contract
3. ✅ **Check:** Contract appears, no duplicates

### 5. Test Updates (2 minutes)
1. Edit the site you just created
2. Change address to `456 Updated St`
3. Save
4. ✅ **Check:** Changes persist, no duplicates

### 6. Verify No Duplicates
- Refresh page 3 times
- Check Sites tab - should show exactly 1 site
- ✅ **No duplicates = Success**

## ✅ Success Checklist

- [ ] Client created successfully
- [ ] Site added and appears in list
- [ ] Site persists after page refresh
- [ ] No duplicate sites appear
- [ ] Editing site works correctly
- [ ] Changes persist after refresh
- [ ] No console errors

## 🐛 If You See Issues

### Duplicate Items?
- Open browser console (F12)
- Check for errors
- Note which tab/action caused duplicates

### Data Not Persisting?
- Check Network tab (F12 → Network)
- Look for failed API calls
- Check if API returns 200 status

### Errors in Console?
- Copy error messages
- Note which action triggered the error

## 📊 Verification Script

After browser test, verify in database:

```bash
# This will check if data is in normalized tables
node test-phase6-normalized-tables.js
```

## 🎉 Expected Result

**All normalized fields (sites, contracts, proposals, followUps, services) should:**
- ✅ Create successfully
- ✅ Appear once in the UI
- ✅ Persist after refresh
- ✅ Update correctly
- ✅ Delete correctly
- ✅ No duplicates ever appear







