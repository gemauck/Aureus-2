# Deployment Cache Fix - Complete Solution

## The Problem

The server was not serving the latest code because:
1. **Nginx was caching JS/CSS files for 30 days** with `Cache-Control: public, immutable`
2. Even with version parameters (`?v=timestamp`), nginx was serving cached files
3. Express server's `no-cache` headers were being overridden by nginx
4. Browser cache was also aggressive

## The Solution

### 1. Nginx Configuration Fix

Run this on the server to fix nginx caching:

```bash
# On the server
cd /var/www/abcotronics-erp
bash fix-nginx-caching.sh
```

This script:
- Disables caching for HTML, JS, CSS, and JSON files
- Forces `no-cache` headers that override Express headers
- Keeps caching for images/fonts (these don't change often)
- Reloads nginx automatically

### 2. Deployment Process

The deployment script now:
1. Builds files locally
2. Pushes to git
3. On server: pulls latest code
4. Runs build on server
5. **Fixes nginx caching** (new step)
6. Clears nginx cache
7. Reloads nginx
8. Restarts PM2

### 3. Build Process

The build process:
- Updates `index.html` with new version timestamps
- Updates `core-bundle.js` URL with version parameter
- Creates `build-version.json` with timestamp

### 4. Server-Side Headers

Express server sets:
- `Cache-Control: no-cache, must-revalidate` for JS/CSS
- `Cache-Control: no-cache, no-store, must-revalidate` for HTML

Nginx now respects these headers instead of overriding them.

## Verification

After deployment, verify:

1. **Check nginx config:**
   ```bash
   cat /etc/nginx/sites-available/abcotronics-erp | grep -A 5 "\.js"
   ```
   Should show `no-cache` headers, not `immutable`.

2. **Check response headers:**
   ```bash
   curl -I https://abcoafrica.co.za/dist/core-bundle.js?v=test
   ```
   Should show `Cache-Control: no-cache, must-revalidate`.

3. **Check build version:**
   ```bash
   curl https://abcoafrica.co.za/dist/build-version.json
   ```
   Should show latest timestamp.

4. **Browser test:**
   - Open DevTools → Network tab
   - Hard refresh (Ctrl+Shift+R)
   - Check JS files have `Cache-Control: no-cache`
   - Check `core-bundle.js` has latest version parameter

## Manual Fix (If Script Fails)

If the script doesn't work, manually update nginx config:

```bash
# Edit nginx config
sudo nano /etc/nginx/sites-available/abcotronics-erp

# Find the location block for JS files:
location ~* \.(js|jsx)$ {
    # Change from:
    expires 30d;
    add_header Cache-Control "public, immutable" always;
    
    # To:
    proxy_hide_header Cache-Control;
    add_header Cache-Control "no-cache, must-revalidate" always;
    add_header Pragma "no-cache" always;
    add_header Expires "0" always;
}

# Test and reload
sudo nginx -t && sudo systemctl reload nginx
```

## Browser Cache Clearing

After deployment, users should:
1. Hard refresh: Ctrl+Shift+R (Cmd+Shift+R on Mac)
2. Or clear cache: Ctrl+Shift+Delete → Clear cached images and files

The app will also auto-detect version changes and prompt users to reload.

## Prevention

To prevent this issue in the future:
1. Always run `fix-nginx-caching.sh` after nginx config changes
2. Verify cache headers in deployment script
3. Test with `curl -I` to check headers
4. Monitor browser console for stale code warnings









