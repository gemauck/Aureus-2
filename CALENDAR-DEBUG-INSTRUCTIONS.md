# Calendar Save Debugging Instructions

## Issue: Calendar entries still don't save

### Step 1: Check Browser Console

1. Open your ERP app in the browser
2. Open Developer Tools (F12)
3. Go to **Console** tab
4. Try to save a calendar entry
5. Look for these logs:

**Expected logs when saving:**
```
📤 Sending calendar note to server: {date: "2025-11-02", note: "..."}
✅ Saved note to server successfully: ...
✅ Calendar notes refreshed after save - verified saved: YES
```

**If you see errors:**
- `❌ Failed to save note to server:` - API call failed
- `Network error` - Connection issue
- `401 Unauthorized` - Auth token expired
- `400 Bad Request` - Invalid request data

### Step 2: Check Network Tab

1. Open Developer Tools → **Network** tab
2. Filter by "calendar-notes"
3. Try saving a calendar entry
4. Click on the POST request to `/api/calendar-notes`
5. Check:
   - **Request Headers**: Should have `Authorization: Bearer <token>`
   - **Request Payload**: Should have `{"date": "2025-11-02", "note": "..."}`
   - **Response**: Check status code and response body

### Step 3: Check Server Logs

SSH into server:
```bash
ssh root@165.22.127.196
cd /var/www/abcotronics-erp
pm2 logs abcotronics-erp --lines 200
```

Look for:
- `📝 Calendar notes POST/PUT request received:` - Request reached server
- `📅 Calendar notes handler called:` - Handler was invoked
- `✅ Calendar note saved successfully:` - Database save succeeded
- Any error messages

### Step 4: Test API Directly

1. Get your auth token from browser console:
   ```javascript
   localStorage.getItem('abcotronics_token')
   ```

2. Test with curl (from server):
   ```bash
   ssh root@165.22.127.196
   cd /var/www/abcotronics-erp
   
   # Replace TOKEN with your actual token
   curl -X POST http://localhost:3000/api/calendar-notes \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN_HERE" \
     -d '{"date": "2025-11-02", "note": "Test from curl"}' \
     -v
   ```

### Step 5: Verify Database

```bash
ssh root@165.22.127.196
cd /var/www/abcotronics-erp
node test-calendar-save.js
```

## Common Issues

### Issue: No POST request appears in Network tab
**Cause**: Frontend isn't sending the request
**Fix**: Check browser console for JavaScript errors

### Issue: POST request returns 401 Unauthorized
**Cause**: Auth token expired or invalid
**Fix**: Log out and log back in

### Issue: POST request returns 400 Bad Request
**Cause**: Invalid date format or missing data
**Fix**: Check request payload in Network tab

### Issue: POST request returns 500 Server Error
**Cause**: Database error or server crash
**Fix**: Check server logs for detailed error

### Issue: POST succeeds but note doesn't appear
**Cause**: Frontend refresh issue
**Fix**: Check if `verified saved: YES` appears in console

## Quick Test Script

Run this in browser console after logging in:

```javascript
const token = localStorage.getItem('abcotronics_token');
const today = new Date().toISOString().split('T')[0];

fetch('/api/calendar-notes', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    date: today,
    note: 'Test from browser console'
  })
})
.then(r => r.json())
.then(data => {
  console.log('✅ Response:', data);
  if (data.saved) {
    console.log('✅ Save successful!');
  } else {
    console.error('❌ Save failed:', data);
  }
})
.catch(err => console.error('❌ Error:', err));
```

If this works, the issue is in the Calendar component.
If this fails, the issue is in the API or authentication.

