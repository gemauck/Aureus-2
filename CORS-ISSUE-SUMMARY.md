# CORS Issue - Summary & Next Steps

## Problem Identified

Your production site at `https://abcoafrica.co.za` is experiencing CORS policy violations, causing all API requests to fail with 403 errors.

### Issues Found

1. **Wrong domain in CORS configuration** ✅ FIXED
   - Server was configured to allow: `abcoafrica.com` (wrong)
   - Should allow: `abcoafrica.co.za` (correct)
   - **Status**: Fixed in `server.js` and pushed to GitHub

2. **Trailing dot in URL** ⚠️ NEEDS INVESTIGATION
   - Error logs show: `https://abcoafrica.co.za./api/...` (trailing dot before slash)
   - This might be a DNS or browser configuration issue
   - **Note**: This is unusual and might be browser-specific

## What I Fixed

### File: `server.js` (Lines 107-117)
Added the correct domain to the allowed origins list:
```javascript
'https://abcoafrica.co.za',
'http://abcoafrica.co.za',
'https://www.abcoafrica.co.za',
'http://www.abcoafrica.co.za'
```

## Next Steps - Deploy to Production

### Option 1: SSH into Server and Deploy

```bash
# SSH into your production server
ssh root@165.22.127.196

# Navigate to project directory
cd /var/www/abcotronics-erp

# Pull latest changes
git pull origin main

# Install any new dependencies
npm install --production

# Generate Prisma client (if needed)
npx prisma generate

# Restart the application
pm2 restart abcotronics-erp

# Check status
pm2 status

# View logs to confirm
pm2 logs abcotronics-erp --lines 50
```

### Option 2: One-Line Deployment

```bash
ssh root@165.22.127.196 'cd /var/www/abcotronics-erp && git pull origin main && npm install --production && npx prisma generate && pm2 restart abcotronics-erp && pm2 status'
```

## Verify the Fix

After deployment, test these:

### 1. Health Check
```bash
curl -I https://abcoafrica.co.za/health
```

### 2. CORS Headers
```bash
curl -H "Origin: https://abcoafrica.co.za" \
     -H "Access-Control-Request-Method: POST" \
     -X OPTIONS \
     https://abcoafrica.co.za/api/health -v
```

Expected headers:
- `Access-Control-Allow-Origin: https://abcoafrica.co.za`
- `Access-Control-Allow-Credentials: true`

### 3. Browser Test
1. Visit: `https://abcoafrica.co.za`
2. Open DevTools (F12)
3. Try to log in
4. Check Network tab for API calls
5. Should see 200 OK instead of 403 Forbidden

## Expected Results After Deployment

✅ Login functionality will work
✅ Token refresh will work  
✅ All API endpoints will respond correctly
✅ No more CORS 403 errors
✅ MonthlyDocumentCollectionTracker will load (secondary issue)

## About the Trailing Dot Issue

The error logs show URLs like `https://abcoafrica.co.za./api/...` with a trailing dot. This is unusual. Possible causes:

1. **Browser DNS configuration** - Some browsers add trailing dots for FQDNs
2. **Environment variable** - Check if `APP_URL` or similar has a trailing dot
3. **Proxy/CDN configuration** - Nginx or Cloudflare might be modifying URLs

To check environment variables:
```bash
ssh root@165.22.127.196
cd /var/www/abcotronics-erp
pm2 env abcotronics-erp | grep APP_URL
# Or
cat .env | grep APP_URL
```

## Troubleshooting

If the issue persists after deployment:

### Check PM2 Logs
```bash
pm2 logs abcotronics-erp --lines 100
```

### Check if Server is Running
```bash
pm2 status
pm2 info abcotronics-erp
```

### Restart Services
```bash
pm2 restart all
# Or
systemctl restart nginx
```

### Verify Configuration
```bash
# Check nginx config
sudo nginx -t
sudo cat /etc/nginx/sites-available/default | grep server_name

# Check environment
pm2 env abcotronics-erp
```

## Files Changed

- ✅ `server.js` - CORS configuration fixed
- ✅ `CORS-FIX-DEPLOYMENT.md` - Deployment instructions created

## Need Help?

If the issue persists after deployment:
1. Share the PM2 logs: `pm2 logs abcotronics-erp --lines 100`
2. Share the nginx logs: `sudo tail -f /var/log/nginx/error.log`
3. Test the health endpoint: `curl https://abcoafrica.co.za/health`

