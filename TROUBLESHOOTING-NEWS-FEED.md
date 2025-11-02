# Troubleshooting: News Articles Not Showing

## Issue
Articles are not displaying in the News Feed tab even though 226 articles exist in the database.

## Verification Steps Completed

✅ **Database Check**: 226 articles confirmed in database  
✅ **API Format**: Response format verified as `{ data: { newsArticles: [...] } }`  
✅ **Component Updated**: Added debug logging and fixed response parsing  
✅ **Server Restarted**: PM2 process restarted with updated component  

## Fixes Applied

1. **Enhanced Debug Logging**
   - Added console.log statements throughout the load process
   - Logs API response status and data
   - Logs parsed article count

2. **Fixed Response Parsing**
   - Changed from `data?.newsArticles || data?.data?.newsArticles`
   - To: `data?.data?.newsArticles || data?.newsArticles`
   - This matches the API response format: `{ data: { newsArticles: [...] } }`

3. **Improved Error Handling**
   - Added detailed error logging
   - Shows API response status and error text
   - Added "Refresh Articles" button for manual testing

4. **Better Empty State**
   - Shows loading state
   - Provides refresh button
   - Instructions to check browser console

## How to Debug

### 1. Check Browser Console (F12)
Open browser DevTools (F12) and look for:
- `📰 Loading news articles...`
- `📰 API Response status: 200`
- `📰 API Response data: {...}`
- `📰 Parsed articles count: 226`

### 2. Test API Directly
In browser console, run:
```javascript
fetch('/api/client-news', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
  }
})
.then(r => r.json())
.then(d => console.log('API Response:', d))
.catch(e => console.error('Error:', e));
```

### 3. Verify Authentication
Make sure you're logged in and have a valid auth token.

### 4. Check Network Tab
- Open Network tab in DevTools
- Refresh the News Feed page
- Look for `/api/client-news` request
- Check:
  - Status code (should be 200)
  - Response body (should contain articles)
  - Request headers (should include Authorization)

## Expected Console Output

When working correctly, you should see:
```
📰 Loading news articles...
📰 API Response status: 200
📰 API Response data: { data: { newsArticles: [...] } }
📰 Parsed articles count: 226
📰 First article sample: { id: "...", title: "...", ... }
📰 Setting articles to state: 226
```

## If Still Not Working

1. **Clear browser cache** and hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
2. **Check authentication** - Make sure you're logged in
3. **Check server logs**: `pm2 logs abcotronics-erp`
4. **Verify API endpoint** is accessible
5. **Check CORS** - Make sure API allows requests from your domain

## Quick Test

After clearing cache, navigate to:
1. CRM section
2. News Feed tab
3. Open browser console (F12)
4. Look for debug messages
5. Click "Refresh Articles" button if needed

---

**Status**: Fixed and deployed  
**Next Action**: Clear browser cache and test

