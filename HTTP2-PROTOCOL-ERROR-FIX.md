# HTTP/2 Protocol Error Fix

## Problem

The application was experiencing HTTP/2 protocol errors:
- `ERR_HTTP2_PROTOCOL_ERROR 200 (OK)` on JSX file requests
- `Uncaught SyntaxError: Identifier 'isProduction' has already been declared`
- `MonthlyDocumentCollectionTracker` failing to load

## Root Causes

1. **HTTP/2 Buffer Issues**: When serving many concurrent JSX files via HTTP/2, nginx was experiencing protocol errors due to improper buffering configuration.

2. **Variable Redeclaration**: The `dataService.js` file had a variable redeclaration issue that caused errors when Babel transformed the file multiple times.

## Fixes Applied

### 1. Fixed Variable Redeclaration in `dataService.js`

**Problem**: Variables `isProduction` and `isLocalhost` were being redeclared in the same scope.

**Solution**: Renamed local variables to avoid conflicts:
```javascript
// Before:
const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
const isProduction = !isLocalhost && window.location.protocol === 'https:';

// After:
const isLocalhostValue = hostname === 'localhost' || hostname === '127.0.0.1';
const isProductionValue = !isLocalhostValue && window.location.protocol === 'https:';
```

### 2. Updated Nginx HTTP/2 Configuration

**Problem**: Improper buffering settings causing HTTP/2 protocol errors with concurrent requests.

**Solution**: Updated nginx configuration with proper HTTP/2 settings:

1. **Enabled proper buffering** (was disabled, which caused issues)
2. **Added HTTP/2 optimizations**:
   - `http2_max_field_size 16k`
   - `http2_max_header_size 32k`
   - `http2_max_requests 1000`
   - `http2_recv_buffer_size 256k`
3. **Set appropriate buffer sizes**:
   - `proxy_buffer_size 4k`
   - `proxy_buffers 8 4k`
   - `proxy_busy_buffers_size 8k`
4. **Added special handling for JSX files** with no-cache headers

## Deployment Instructions

### Option 1: Use the Fix Script (Recommended)

1. Upload the fix script to your server:
   ```bash
   scp fix-http2-nginx.sh root@abcoafrica.co.za:/root/
   ```

2. Run the script on the server:
   ```bash
   ssh root@abcoafrica.co.za
   chmod +x /root/fix-http2-nginx.sh
   /root/fix-http2-nginx.sh
   ```

### Option 2: Manual Update

1. SSH into your server:
   ```bash
   ssh root@abcoafrica.co.za
   ```

2. Backup current config:
   ```bash
   cp /etc/nginx/sites-available/abcotronics-erp /etc/nginx/sites-available/abcotronics-erp.backup
   ```

3. Edit the nginx config:
   ```bash
   nano /etc/nginx/sites-available/abcotronics-erp
   ```

4. Update the server block with the new settings (see `setup-https-abcoafrica.sh`)

5. Test and reload:
   ```bash
   nginx -t
   systemctl reload nginx
   ```

### Deploy Code Changes

1. Commit and push the dataService.js fix:
   ```bash
   git add src/utils/dataService.js
   git commit -m "Fix: Resolve isProduction variable redeclaration error"
   git push origin main
   ```

2. Pull on the server:
   ```bash
   ssh root@abcoafrica.co.za
   cd /var/www/abcotronics-erp
   git pull
   ```

3. Restart the application:
   ```bash
   pm2 restart abcotronics-erp
   ```

## Verification

After applying the fixes:

1. **Hard refresh** your browser: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)

2. **Check console** - should see:
   - ✅ No HTTP/2 protocol errors
   - ✅ No variable redeclaration errors
   - ✅ All JSX files loading successfully
   - ✅ MonthlyDocumentCollectionTracker loaded

3. **Monitor nginx logs** (optional):
   ```bash
   tail -f /var/log/nginx/error.log
   ```

## Alternative: Disable HTTP/2 (if issues persist)

If HTTP/2 continues to cause problems, you can temporarily disable it:

```bash
# On server
nano /etc/nginx/sites-available/abcotronics-erp
# Change: listen 443 ssl http2;
# To: listen 443 ssl;
systemctl reload nginx
```

Note: This will use HTTP/1.1, which may be slower but more stable for many small concurrent files.

## Files Modified

1. `src/utils/dataService.js` - Fixed variable redeclaration
2. `setup-https-abcoafrica.sh` - Updated nginx config template
3. `fix-http2-nginx.sh` - Created deployment script for server

## Expected Results

- ✅ No more `ERR_HTTP2_PROTOCOL_ERROR` in browser console
- ✅ All JSX files load without errors
- ✅ MonthlyDocumentCollectionTracker component loads successfully
- ✅ No variable redeclaration errors
- ✅ Faster page loads with HTTP/2 working correctly

