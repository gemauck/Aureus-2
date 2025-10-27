# CORS Policy Violation Fix - Deployment Instructions

## Issue Summary

The production server at `https://abcoafrica.co.za` was blocking all API requests with a **403 CORS policy violation** error.

### Root Cause

The CORS configuration in `server.js` was allowing requests from the wrong domain:
- ❌ **Old**: `https://abcoafrica.com` (incorrect)
- ✅ **Fixed**: `https://abcoafrica.co.za` (correct)

### Error Messages
```
POST https://abcoafrica.co.za/api/auth/refresh 403 (Forbidden)
❌ API Error: {path: '/auth/refresh', status: 403, error: 'CORS policy violation'}
```

## Fix Applied

Updated `server.js` (lines 107-117) to include the correct domain:
```javascript
const allowedOrigins = [
  process.env.APP_URL,
  'http://localhost:3000',
  'http://localhost:3001', 
  'http://localhost:3002',
  'http://localhost:8000',
  'https://abcoafrica.co.za',        // ✅ Added
  'http://abcoafrica.co.za',         // ✅ Added
  'https://www.abcoafrica.co.za',    // ✅ Added
  'http://www.abcoafrica.co.za'      // ✅ Added
].filter(Boolean)
```

## Deployment Steps

### Option 1: Deploy via Git (Recommended)

```bash
cd /var/www/abcotronics-erp
git pull origin main
npm install --production
pm2 restart abcotronics-erp
pm2 status
```

### Option 2: Manual Edit on Server

If you need to fix it directly on the server:
```bash
ssh root@165.22.127.196
cd /var/www/abcotronics-erp
nano server.js
# Update the allowedOrigins array (lines 107-117)
pm2 restart abcotronics-erp
pm2 logs abcotronics-erp --lines 50
```

## Verification

After deployment, check:

1. **API Health Check**:
```bash
curl -I https://abcoafrica.co.za/health
```

2. **CORS Headers Check**:
```bash
curl -H "Origin: https://abcoafrica.co.za" \
     -H "Access-Control-Request-Method: POST" \
     -X OPTIONS \
     https://abcoafrica.co.za/api/health -v
```

Expected response headers:
```
Access-Control-Allow-Origin: https://abcoafrica.co.za
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS
```

3. **Test Login**:
   - Visit: https://abcoafrica.co.za
   - Try to log in
   - Should no longer get 403 errors

## Additional Notes

### MonthlyDocumentCollectionTracker Error
The error "MonthlyDocumentCollectionTracker failed to load" was a **secondary issue** caused by the authentication failure. Once the CORS is fixed, this component will load properly.

### Already Correct
The `api/_lib/withHttp.js` file already had the correct domain configuration, so no changes needed there.

## Expected Behavior After Fix

- ✅ API requests from https://abcoafrica.co.za will be accepted
- ✅ Login functionality will work
- ✅ Token refresh will work
- ✅ All API endpoints will respond correctly
- ✅ No more 403 CORS errors

## Troubleshooting

If issues persist after deployment:

1. **Check PM2 logs**:
```bash
pm2 logs abcotronics-erp --lines 100
```

2. **Verify environment variables**:
```bash
pm2 env abcotronics-erp | grep APP_URL
```

3. **Test with curl**:
```bash
curl -X POST https://abcoafrica.co.za/api/login \
  -H "Origin: https://abcoafrica.co.za" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test"}' \
  -v
```

4. **Restart nginx** (if applicable):
```bash
sudo systemctl restart nginx
sudo nginx -t
```

